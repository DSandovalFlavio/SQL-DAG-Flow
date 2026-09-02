"""Node identity and dependency resolution.

These are the correctness guarantees the tool actually sells: every model on
disk shows up exactly once, and an edge is only drawn when the reference
genuinely resolves. A fabricated edge is worse than a missing one, because the
whole point is deciding what a change will break.
"""

from conftest import edge_pairs, node_ids

from sql_dag_flow.parser import build_graph, parse_sql_files


# --------------------------------------------------------------------------
# Identity: one file on disk == one node in the graph
# --------------------------------------------------------------------------

def test_same_basename_in_different_folders_both_survive(project):
    """staging/customers.sql + marts/customers.sql is the standard dbt layout."""
    root = project({
        "bronze/customers.sql": "CREATE TABLE proj.raw.customers AS SELECT id FROM ext.source_a;",
        "gold/customers.sql": "CREATE TABLE proj.mart.customers AS SELECT id FROM ext.source_b;",
    })

    tables = parse_sql_files(root)

    assert len(tables) == 2, f"a colliding basename silently dropped a model: {sorted(tables)}"
    datasets = sorted(t["dataset"] for t in tables.values())
    assert datasets == ["mart", "raw"]


def test_colliding_ids_are_disambiguated_by_path(project):
    root = project({
        "bronze/customers.sql": "CREATE TABLE proj.raw.customers AS SELECT 1 AS id;",
        "gold/customers.sql": "CREATE TABLE proj.mart.customers AS SELECT 1 AS id;",
    })

    ids = set(parse_sql_files(root))

    assert ids == {"bronze/customers", "gold/customers"}


def test_unique_basename_keeps_its_plain_id(project):
    """Ids only grow a path prefix when they'd otherwise collide, so existing
    saved views keep working."""
    root = project({
        "silver/orders.sql": "CREATE TABLE proj.sales.orders AS SELECT 1 AS id;",
    })

    assert set(parse_sql_files(root)) == {"orders"}


def test_collision_is_reported_as_a_warning(project):
    root = project({
        "a/dupe.sql": "SELECT 1;",
        "b/dupe.sql": "SELECT 1;",
    })

    tables = parse_sql_files(root)
    _, _, _, warnings = build_graph(tables)

    kinds = {w["kind"] for w in warnings}
    assert "duplicate_name" in kinds


# --------------------------------------------------------------------------
# Resolution: never invent an edge
# --------------------------------------------------------------------------

def test_no_phantom_edge_when_dataset_differs(project):
    """proj.sales.orders must not resolve to proj.finance.orders."""
    root = project({
        "silver/finance_orders.sql": "CREATE TABLE proj.finance.orders AS SELECT 1 AS id;",
        "gold/sales_report.sql": "CREATE TABLE proj.sales.report AS SELECT * FROM proj.sales.orders;",
    })

    tables = parse_sql_files(root)
    _, edges, _, _ = build_graph(tables)

    assert ("finance_orders", "sales_report") not in edge_pairs(edges), (
        "matched on the bare table name across two different datasets"
    )


def test_unresolved_reference_is_reported(project):
    root = project({
        "silver/finance_orders.sql": "CREATE TABLE proj.finance.orders AS SELECT 1 AS id;",
        "gold/sales_report.sql": "CREATE TABLE proj.sales.report AS SELECT * FROM proj.sales.orders;",
    })

    tables = parse_sql_files(root)
    _, _, _, warnings = build_graph(tables)

    unresolved = [w for w in warnings if w["kind"] == "unresolved_reference"]
    assert any("proj.sales.orders" in w["reference"] for w in unresolved)


def test_exact_qualified_reference_resolves(project):
    root = project({
        "silver/orders.sql": "CREATE TABLE proj.sales.orders AS SELECT 1 AS id;",
        "gold/report.sql": "CREATE TABLE proj.sales.report AS SELECT * FROM proj.sales.orders;",
    })

    tables = parse_sql_files(root)
    _, edges, _, _ = build_graph(tables)

    assert ("orders", "report") in edge_pairs(edges)


def test_dataset_qualified_reference_resolves(project):
    root = project({
        "silver/orders.sql": "CREATE TABLE proj.sales.orders AS SELECT 1 AS id;",
        "gold/report.sql": "CREATE TABLE proj.sales.report AS SELECT * FROM sales.orders;",
    })

    tables = parse_sql_files(root)
    _, edges, _, _ = build_graph(tables)

    assert ("orders", "report") in edge_pairs(edges)


def test_reference_resolves_when_model_declares_no_dataset(project):
    """Plenty of projects are bare SELECTs with no CREATE target. A qualified
    reference should still find them — there's no declared dataset to contradict."""
    root = project({
        "silver/orders.sql": "SELECT 1 AS id;",
        "gold/report.sql": "CREATE TABLE proj.sales.report AS SELECT * FROM sales.orders;",
    })

    tables = parse_sql_files(root)
    _, edges, _, _ = build_graph(tables)

    assert ("orders", "report") in edge_pairs(edges)


def test_ambiguous_bare_reference_is_not_guessed(project):
    """Two candidates, no way to tell which: refuse and say so."""
    root = project({
        "a/orders.sql": "CREATE TABLE proj.finance.orders AS SELECT 1 AS id;",
        "b/orders.sql": "CREATE TABLE proj.sales.orders AS SELECT 1 AS id;",
        "gold/report.sql": "CREATE TABLE proj.other.report AS SELECT * FROM orders;",
    })

    tables = parse_sql_files(root)
    _, edges, _, warnings = build_graph(tables)

    into_report = {s for s, t in edge_pairs(edges) if t == "report"}
    assert into_report == set(), f"guessed between ambiguous candidates: {into_report}"
    assert any(w["kind"] == "ambiguous_reference" for w in warnings)


def test_self_reference_does_not_create_a_loop(project):
    root = project({
        "silver/orders.sql": "CREATE TABLE proj.sales.orders AS SELECT * FROM proj.sales.orders;",
    })

    tables = parse_sql_files(root)
    _, edges, _, _ = build_graph(tables)

    assert ("orders", "orders") not in edge_pairs(edges)


def test_nodes_expose_their_fully_qualified_name(project):
    root = project({
        "silver/orders.sql": "CREATE TABLE proj.sales.orders AS SELECT 1 AS id;",
    })

    nodes, _, _, _ = build_graph(parse_sql_files(root))

    assert node_ids(nodes) == {"orders"}
    assert nodes[0]["data"]["details"]["fqn"] == "proj.sales.orders"
