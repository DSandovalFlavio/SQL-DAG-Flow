"""Graph construction: reachability counts, cycles, CTE handling, scoping."""

from conftest import edge_pairs, node_ids

from sql_dag_flow.parser import build_graph, parse_sql_files

CHAIN = {
    "bronze/raw_users.sql": "CREATE TABLE proj.raw.raw_users AS SELECT 1 AS id;",
    "silver/clean_users.sql": "CREATE TABLE proj.stg.clean_users AS SELECT id FROM proj.raw.raw_users;",
    "gold/user_stats.sql": "CREATE TABLE proj.mart.user_stats AS SELECT id FROM proj.stg.clean_users;",
}


def test_linear_chain_edges(project):
    tables = parse_sql_files(project(CHAIN))
    _, edges, _, _ = build_graph(tables)

    assert edge_pairs(edges) == {
        ("raw_users", "clean_users"),
        ("clean_users", "user_stats"),
    }


def test_reachability_counts(project):
    nodes, _, _, _ = build_graph(parse_sql_files(project(CHAIN)))
    by_id = {n["id"]: n["data"] for n in nodes}

    assert by_id["raw_users"]["nestedCount"] == 0
    assert by_id["raw_users"]["downstreamCount"] == 2
    assert by_id["user_stats"]["nestedCount"] == 2
    assert by_id["user_stats"]["downstreamCount"] == 0
    assert by_id["clean_users"]["incomingCount"] == 1


def test_diamond_counts_do_not_double_count(project):
    """Both branches share the same root; it must be counted once."""
    root = project({
        "a.sql": "CREATE TABLE d.a AS SELECT 1 AS id;",
        "b.sql": "CREATE TABLE d.b AS SELECT id FROM d.a;",
        "c.sql": "CREATE TABLE d.c AS SELECT id FROM d.a;",
        "e.sql": "CREATE TABLE d.e AS SELECT b.id FROM d.b JOIN d.c ON b.id = c.id;",
    })

    nodes, _, _, _ = build_graph(parse_sql_files(root))
    by_id = {n["id"]: n["data"] for n in nodes}

    assert by_id["e"]["nestedCount"] == 3   # a, b, c
    assert by_id["a"]["downstreamCount"] == 3  # b, c, e


def test_cycle_is_detected(project):
    root = project({
        "x.sql": "CREATE TABLE d.x AS SELECT id FROM d.y;",
        "y.sql": "CREATE TABLE d.y AS SELECT id FROM d.x;",
    })

    _, _, cycles, _ = build_graph(parse_sql_files(root))

    assert cycles, "expected a circular dependency to be reported"


def test_counts_survive_a_cyclic_graph(project):
    """The fast topological path is undefined on cycles; it must fall back."""
    root = project({
        "x.sql": "CREATE TABLE d.x AS SELECT id FROM d.y;",
        "y.sql": "CREATE TABLE d.y AS SELECT id FROM d.x;",
    })

    nodes, _, _, _ = build_graph(parse_sql_files(root))

    for n in nodes:
        assert n["data"]["nestedCount"] >= 1
        assert n["data"]["downstreamCount"] >= 1


def test_cte_dependencies_are_flattened_by_default(project):
    """In normal mode a CTE's sources attach straight to the parent model."""
    root = project({
        "src.sql": "CREATE TABLE d.src AS SELECT 1 AS id;",
        "model.sql": (
            "CREATE TABLE d.model AS "
            "WITH stepped AS (SELECT id FROM d.src) "
            "SELECT id FROM stepped;"
        ),
    })

    nodes, edges, _, _ = build_graph(parse_sql_files(root))

    assert ("src", "model") in edge_pairs(edges)
    assert node_ids(nodes) == {"src", "model"}, "CTE must not materialize as a node here"


def test_cte_becomes_a_node_in_discovery_mode(project):
    root = project({
        "src.sql": "CREATE TABLE d.src AS SELECT 1 AS id;",
        "model.sql": (
            "CREATE TABLE d.model AS "
            "WITH stepped AS (SELECT id FROM d.src) "
            "SELECT id FROM stepped;"
        ),
    })

    nodes, _, _, _ = build_graph(parse_sql_files(root), discovery_mode=True)

    assert any(n["data"]["layer"] == "cte" for n in nodes)


def test_layer_comes_from_folder(project):
    root = project({
        "bronze/a.sql": "SELECT 1;",
        "silver/b.sql": "SELECT 1;",
        "gold/c.sql": "SELECT 1;",
        "misc/d.sql": "SELECT 1;",
    })

    tables = parse_sql_files(root)

    assert tables["a"]["layer"] == "bronze"
    assert tables["b"]["layer"] == "silver"
    assert tables["c"]["layer"] == "gold"
    assert tables["d"]["layer"] == "other"


# --------------------------------------------------------------------------
# Scoping
# --------------------------------------------------------------------------

def test_target_ids_limits_what_is_parsed(project):
    tables = parse_sql_files(project(CHAIN), target_ids=["clean_users"])

    assert set(tables) == {"clean_users"}


def test_scoped_parse_still_resolves_edges_within_scope(project):
    tables = parse_sql_files(project(CHAIN), target_ids=["raw_users", "clean_users"])
    _, edges, _, _ = build_graph(tables)

    assert ("raw_users", "clean_users") in edge_pairs(edges)


def test_syntax_error_does_not_abort_the_walk(project):
    root = project({
        "good.sql": "CREATE TABLE d.good AS SELECT 1 AS id;",
        "bad.sql": "CREATE TABLE ((( FROM WHERE;",
    })

    tables = parse_sql_files(root)

    assert "good" in tables
    assert "bad" in tables
    assert tables["bad"].get("error") or tables["bad"].get("syntax_warnings")
