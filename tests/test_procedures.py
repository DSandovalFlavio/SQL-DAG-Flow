"""Stored procedures and multi-statement scripts.

A procedure is a transformation unit like any model, but with two differences
that matter for lineage: its body holds many statements, and it *writes* to
tables rather than being one table. Writes become outgoing edges, so a
procedure sits between the tables it reads and the tables it produces.
"""

from conftest import edge_pairs, node_ids

from sql_dag_flow.parser import build_graph, parse_sql_files

PROC = """
CREATE OR REPLACE PROCEDURE proj.ops.refresh_sales()
BEGIN
  INSERT INTO proj.gold.sales_daily (id, amount)
  SELECT o.id, o.amount
  FROM proj.silver.orders o
  JOIN proj.silver.customers c ON o.cid = c.id;

  MERGE INTO proj.gold.sales_summary t
  USING proj.silver.orders s ON t.id = s.id
  WHEN MATCHED THEN UPDATE SET t.amount = s.amount;
END;
"""


def _project_with_proc(project):
    return project({
        "silver/orders.sql": "CREATE TABLE proj.silver.orders AS SELECT 1 AS id, 2 AS cid, 3 AS amount;",
        "silver/customers.sql": "CREATE TABLE proj.silver.customers AS SELECT 1 AS id;",
        "gold/sales_daily.sql": "CREATE TABLE proj.gold.sales_daily AS SELECT 1 AS id, 2 AS amount;",
        "gold/sales_summary.sql": "CREATE TABLE proj.gold.sales_summary AS SELECT 1 AS id, 2 AS amount;",
        "ops/refresh_sales.sql": PROC,
    })


def test_procedure_is_detected(project):
    tables = parse_sql_files(_project_with_proc(project))

    proc = tables["refresh_sales"]
    assert proc["type"] == "procedure"
    assert proc["fqn"] == "proj.ops.refresh_sales"
    assert proc["dataset"] == "ops"


def test_procedure_reads_become_incoming_edges(project):
    tables = parse_sql_files(_project_with_proc(project))
    _, edges, _, _ = build_graph(tables)
    pairs = edge_pairs(edges)

    assert ("orders", "refresh_sales") in pairs
    assert ("customers", "refresh_sales") in pairs


def test_procedure_writes_become_outgoing_edges(project):
    """This is what makes a procedure readable: it produces tables."""
    tables = parse_sql_files(_project_with_proc(project))
    _, edges, _, _ = build_graph(tables)
    pairs = edge_pairs(edges)

    assert ("refresh_sales", "sales_daily") in pairs
    assert ("refresh_sales", "sales_summary") in pairs


def test_write_targets_are_not_also_read(project):
    """INSERT INTO gold.x SELECT FROM silver.y: gold.x is written, not read."""
    tables = parse_sql_files(_project_with_proc(project))
    _, edges, _, _ = build_graph(tables)
    pairs = edge_pairs(edges)

    assert ("sales_daily", "refresh_sales") not in pairs
    assert ("sales_summary", "refresh_sales") not in pairs


def test_call_creates_a_dependency_between_procedures(project):
    root = project({
        "ops/audit_log.sql": "CREATE PROCEDURE proj.ops.audit_log() BEGIN SELECT 1; END;",
        "ops/nightly.sql": (
            "CREATE PROCEDURE proj.ops.nightly() BEGIN\n"
            "  CALL proj.ops.audit_log();\n"
            "END;"
        ),
    })

    tables = parse_sql_files(root)
    _, edges, _, _ = build_graph(tables)

    assert ("audit_log", "nightly") in edge_pairs(edges)


def test_multi_statement_script_collects_every_dependency(project):
    """Not a procedure — just a file with several statements. Previously only
    the first statement was inspected."""
    root = project({
        "a.sql": "CREATE TABLE d.a AS SELECT 1 AS id;",
        "b.sql": "CREATE TABLE d.b AS SELECT 1 AS id;",
        "script.sql": (
            "CREATE TABLE d.script AS SELECT id FROM d.a;\n"
            "INSERT INTO d.script SELECT id FROM d.b;\n"
        ),
    })

    tables = parse_sql_files(root)
    _, edges, _, _ = build_graph(tables)
    pairs = edge_pairs(edges)

    assert ("a", "script") in pairs
    assert ("b", "script") in pairs


def test_ctas_does_not_write_to_itself(project):
    root = project({
        "src.sql": "CREATE TABLE d.src AS SELECT 1 AS id;",
        "model.sql": "CREATE TABLE d.model AS SELECT id FROM d.src;",
    })

    tables = parse_sql_files(root)
    _, edges, _, _ = build_graph(tables)

    assert ("model", "model") not in edge_pairs(edges)


def test_procedure_without_a_body_does_not_crash(project):
    root = project({
        "ops/empty.sql": "CREATE PROCEDURE proj.ops.empty();",
    })

    tables = parse_sql_files(root)
    nodes, _, _, _ = build_graph(tables)

    assert node_ids(nodes) == {"empty"}


def test_procedure_writes_are_exposed_on_the_node(project):
    tables = parse_sql_files(_project_with_proc(project))

    writes = tables["refresh_sales"].get("writes", {})
    written = {w.split(".")[-1] for w in writes}
    assert written == {"sales_daily", "sales_summary"}


# --------------------------------------------------------------------------
# Real-world BigQuery procedures
# --------------------------------------------------------------------------

REAL_SP = """-- Procedimiento: sp_reload_stg_mkt_dv360_ad_rgn_stats_trn
-- Dominio: mkt - Subdominio: platdig - Capa: 1_bronze
CREATE OR REPLACE PROCEDURE `crp-dev-dominio-mkt.mus_dev_platdig_raw_tbls.sp_reload_stats`(
  OUT o_rows_deleted  INT64,
  OUT o_rows_inserted INT64
)
OPTIONS(
  description = "[BRONZE] Ingesta idempotente de TMP hacia TRN"
)
BEGIN
  DELETE FROM `crp-dev-dominio-mkt.mus_dev_platdig_raw_tbls.STG_MKT_STATS_TRN`
  WHERE FCH_DATE >= '2024-01-01';

  INSERT INTO `crp-dev-dominio-mkt.mus_dev_platdig_raw_tbls.STG_MKT_STATS_TRN`
  SELECT * FROM `crp-dev-dominio-mkt.mus_dev_platdig_raw_tbls.STG_MKT_STATS_TMP`;
END;
"""


def _real_project(project):
    return project({
        "bronze/STG_MKT_STATS_TMP.sql": (
            "CREATE TABLE `crp-dev-dominio-mkt.mus_dev_platdig_raw_tbls.STG_MKT_STATS_TMP` "
            "AS SELECT 1 AS FCH_DATE;"
        ),
        "bronze/STG_MKT_STATS_TRN.sql": (
            "CREATE TABLE `crp-dev-dominio-mkt.mus_dev_platdig_raw_tbls.STG_MKT_STATS_TRN` "
            "AS SELECT 1 AS FCH_DATE;"
        ),
        "bronze/sp_reload_stats.sql": REAL_SP,
    })


def test_out_parameters_do_not_break_the_procedure(project):
    """sqlglot's BigQuery dialect rejects OUT/INOUT in a procedure signature,
    which failed the whole file and lost all of its lineage."""
    tables = parse_sql_files(_real_project(project))

    proc = tables["sp_reload_stats"]
    assert not proc.get("error"), f"procedure failed to parse: {proc.get('error')}"
    assert not proc.get("syntax_warnings")
    assert proc["type"] == "procedure"


def test_backtick_qualified_name_with_dashes(project):
    tables = parse_sql_files(_real_project(project))

    assert tables["sp_reload_stats"]["fqn"] == (
        "crp-dev-dominio-mkt.mus_dev_platdig_raw_tbls.sp_reload_stats"
    )


def test_real_procedure_lineage(project):
    tables = parse_sql_files(_real_project(project))
    _, edges, _, _ = build_graph(tables)
    pairs = edge_pairs(edges)

    # reads TMP, writes TRN (DELETE + INSERT both target TRN)
    assert ("STG_MKT_STATS_TMP", "sp_reload_stats") in pairs
    assert ("sp_reload_stats", "STG_MKT_STATS_TRN") in pairs
    # the written table must not also be counted as a source
    assert ("STG_MKT_STATS_TRN", "sp_reload_stats") not in pairs


def test_a_stale_cache_cannot_hide_a_parser_fix(project):
    """A file that failed to parse must be retried, not served from cache.

    The cache key is the file's mtime+size, so a procedure that failed under an
    older parser would keep returning that failure forever — a fix would appear
    to do nothing until the user deleted .sqldagflow by hand.
    """
    import json
    import os

    from sql_dag_flow.parser import _file_cache_key

    root = project({"sp.sql": REAL_SP})
    path = os.path.join(root, "sp.sql")

    # Simulate what an older, broken parser left behind.
    os.makedirs(os.path.join(root, ".sqldagflow"), exist_ok=True)
    with open(os.path.join(root, ".sqldagflow", "cache.json"), "w", encoding="utf-8") as f:
        json.dump({path: {
            "v": 2,
            "cache_key": _file_cache_key(path),
            "dialect": "bigquery",
            "data": {
                "id": "sp", "label": "sp", "fqn": "sp", "layer": "other",
                "type": "unknown", "project": "n/a", "dataset": "n/a",
                "path": path, "dependencies": {},
                "error": "Expecting ). Line 3, Col: 20.",
                "syntax_warnings": [{"description": "Expecting )", "line": 3, "col": 20}],
                "content": REAL_SP,
            },
        }}, f)

    tables = parse_sql_files(root)

    assert tables["sp"]["type"] == "procedure"
    assert not tables["sp"].get("syntax_warnings")


def test_failed_parses_are_not_written_to_the_cache(project):
    import json
    import os

    root = project({"broken.sql": "CREATE TABLE ((( FROM WHERE;"})
    parse_sql_files(root)

    cache_path = os.path.join(root, ".sqldagflow", "cache.json")
    cached = json.load(open(cache_path, encoding="utf-8")) if os.path.exists(cache_path) else {}

    assert not any("broken.sql" in key for key in cached), (
        "a failed parse was cached and would survive a parser fix"
    )


# --------------------------------------------------------------------------
# BigQuery scripting constructs sqlglot cannot parse
# --------------------------------------------------------------------------

SCRIPTING_SP = """CREATE OR REPLACE PROCEDURE `crp-dev.d.sp_reload`(
  OUT o_rows_deleted  INT64,
  OUT o_rows_inserted INT64
)
BEGIN
  DECLARE v_min_date DATE;
  DECLARE v_tmp_rows INT64;

  -- SELECT ... INTO is BigQuery scripting; sqlglot rejects it
  SELECT MIN(FCH_DATE), COUNT(*)
  INTO v_min_date, v_tmp_rows
  FROM `crp-dev.d.STG_TMP`;

  IF v_tmp_rows IS NULL OR v_tmp_rows = 0 THEN
    RAISE USING MESSAGE = FORMAT('%s abortado: TMP llego vacio.', 'sp_reload');
  END IF;

  DELETE FROM `crp-dev.d.STG_TRN` WHERE FCH_DATE >= v_min_date;

  INSERT INTO `crp-dev.d.STG_TRN`
  SELECT * FROM `crp-dev.d.STG_TMP`;
END;
"""


def _scripting_project(project):
    return project({
        "bronze/STG_TMP.sql": "CREATE TABLE `crp-dev.d.STG_TMP` AS SELECT 1 AS FCH_DATE;",
        "bronze/STG_TRN.sql": "CREATE TABLE `crp-dev.d.STG_TRN` AS SELECT 1 AS FCH_DATE;",
        "bronze/sp_reload.sql": SCRIPTING_SP,
    })


def test_select_into_does_not_break_the_procedure(project):
    """One unsupported statement must not cost the whole procedure."""
    tables = parse_sql_files(_scripting_project(project))

    proc = tables["sp_reload"]
    assert proc["type"] == "procedure", f"got {proc['type']}, error={proc.get('error')}"
    assert not proc.get("syntax_warnings")


def test_lineage_survives_unparseable_statements(project):
    """The DELETE and INSERT still parse, so their lineage must be kept even
    though the SELECT ... INTO above them does not."""
    tables = parse_sql_files(_scripting_project(project))
    _, edges, _, _ = build_graph(tables)
    pairs = edge_pairs(edges)

    assert ("STG_TMP", "sp_reload") in pairs
    assert ("sp_reload", "STG_TRN") in pairs


def test_select_into_is_still_read_as_a_dependency(project):
    """The table behind SELECT ... INTO is a genuine read."""
    tables = parse_sql_files(project({
        "bronze/STG_TMP.sql": "CREATE TABLE `crp-dev.d.STG_TMP` AS SELECT 1 AS FCH_DATE;",
        "bronze/sp_probe.sql": (
            "CREATE OR REPLACE PROCEDURE `crp-dev.d.sp_probe`(OUT n INT64)\n"
            "BEGIN\n"
            "  DECLARE v_rows INT64;\n"
            "  SELECT COUNT(*) INTO v_rows FROM `crp-dev.d.STG_TMP`;\n"
            "END;"
        ),
    }))

    deps = tables["sp_probe"]["dependencies"]
    assert any("STG_TMP" in d for d in deps), f"lost the read: {list(deps)}"


# --------------------------------------------------------------------------
# The source text decides what is a procedure, not the AST
# --------------------------------------------------------------------------

def test_procedure_detected_even_when_the_ast_gives_up(project, monkeypatch):
    """If sqlglot cannot build anything useful, the declaration still stands."""
    import sqlglot

    from sql_dag_flow import parser as parser_module

    def refuse(*args, **kwargs):
        raise sqlglot.errors.ParseError("nope")

    root = project({"ops/sp_x.sql": (
        "CREATE OR REPLACE PROCEDURE `proj.ops.sp_x`(OUT n INT64)\n"
        "BEGIN\n  INSERT INTO `proj.d.t` SELECT 1;\nEND;"
    )})
    monkeypatch.setattr(parser_module.sqlglot, "parse_one", refuse)

    tables = parse_sql_files(root)
    # The file could not be parsed at all, so it is an error node — but it must
    # never be silently presented as a table.
    assert tables["sp_x"]["type"] != "table"


def test_keyword_inside_a_comment_does_not_make_a_procedure(project):
    root = project({"models/t.sql": (
        "-- This model replaces the old CREATE OR REPLACE PROCEDURE approach\n"
        "CREATE TABLE `proj.d.t` AS SELECT 1 AS id;"
    )})

    assert parse_sql_files(root)["t"]["type"] == "table"


def test_procedure_name_comes_from_the_declaration(project):
    """Not from the filename, which often differs."""
    root = project({"ops/whatever_filename.sql": (
        "CREATE OR REPLACE PROCEDURE `crp-dev-mkt.platdig.sp_reload_stats`(OUT n INT64)\n"
        "BEGIN\n  SELECT 1;\nEND;"
    )})

    proc = parse_sql_files(root)["whatever_filename"]
    assert proc["label"] == "sp_reload_stats"
    assert proc["dataset"] == "platdig"
    assert proc["project"] == "crp-dev-mkt"
    assert proc["fqn"] == "crp-dev-mkt.platdig.sp_reload_stats"


def test_create_procedure_without_or_replace(project):
    root = project({"ops/sp_y.sql": "CREATE PROCEDURE `proj.ops.sp_y`() BEGIN SELECT 1; END;"})
    assert parse_sql_files(root)["sp_y"]["type"] == "procedure"
