"""Graph-wide answers must not depend on what happened to be on screen.

The qualify_columns pass only runs for visible nodes (it's expensive). When its
output was written back into `column_references`, the aggregate built from it —
"which models consume this column?" — silently changed with the viewport.
"""

from sql_dag_flow.parser import build_graph, parse_sql_files

PROJECT = {
    "bronze/orders_raw.sql": (
        "CREATE TABLE proj.raw.orders_raw AS "
        "SELECT 1 AS order_id, 2 AS customer_id, 3 AS amount;"
    ),
    "silver/orders_clean.sql": (
        "CREATE TABLE proj.stg.orders_clean AS "
        "SELECT order_id, amount FROM proj.raw.orders_raw;"
    ),
    "gold/orders_summary.sql": (
        "CREATE TABLE proj.mart.orders_summary AS "
        "SELECT order_id, amount FROM proj.stg.orders_clean;"
    ),
}


def _consumers(root, visible):
    tables = parse_sql_files(root, visible_node_ids=visible)
    nodes, _, _, _ = build_graph(tables)
    return {
        n["id"]: {
            col: sorted(c["node"] for c in consumers)
            for col, consumers in n["data"]["details"].get("column_consumers", {}).items()
        }
        for n in nodes
    }


def test_column_consumers_are_viewport_independent(project):
    root = project(PROJECT)

    everything = _consumers(root, None)
    only_one_visible = _consumers(root, ["orders_summary"])
    a_different_one = _consumers(root, ["orders_raw"])

    assert everything == only_one_visible == a_different_one, (
        "column consumers changed depending on which nodes were visible"
    )


def test_qualified_refs_are_kept_separate(project):
    """The precise pass still runs — it just doesn't overwrite the shared field."""
    root = project(PROJECT)

    tables = parse_sql_files(root, visible_node_ids=["orders_clean"])

    assert "column_references" in tables["orders_clean"]
    assert "column_references_qualified" in tables["orders_clean"]
    # A node outside the visible set gets only the consistent field.
    assert "column_references_qualified" not in tables["orders_raw"]
