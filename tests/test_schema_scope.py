"""The schema handed to sqlglot's expensive passes.

Two things were quietly wrong here. `extract_output_columns` stores an
expression's SQL text in the "type" slot for computed columns, and sqlglot
raises while parsing that as a data type — so the whole qualify_columns pass
was thrown away. And every model was handed the entire project's schema, which
made both passes scale with project size instead of with the model.
"""

from sql_dag_flow.parser import _sql_type_or_fallback, parse_sql_files


def test_real_sql_types_are_preserved():
    assert _sql_type_or_fallback("INT64") == "INT64"
    assert _sql_type_or_fallback("STRING") == "STRING"
    assert _sql_type_or_fallback("NUMERIC(10,2)") == "NUMERIC"
    assert _sql_type_or_fallback("timestamp") == "TIMESTAMP"


def test_expression_placeholders_become_unknown():
    """These are what extract_output_columns emits for computed columns, and
    what used to make qualify_columns raise."""
    assert _sql_type_or_fallback("column") == "UNKNOWN"
    assert _sql_type_or_fallback("expression") == "UNKNOWN"
    assert _sql_type_or_fallback("CASE WHEN x > 1 THEN 'a' ELSE 'b' END") == "UNKNOWN"
    assert _sql_type_or_fallback(None) == "UNKNOWN"
    assert _sql_type_or_fallback("") == "UNKNOWN"


def test_qualify_pass_actually_produces_a_result(project):
    """A model whose columns are computed expressions still gets qualified.

    Before the type sanitiser this raised inside sqlglot and silently fell back,
    so the pass cost its full runtime and delivered nothing.
    """
    root = project({
        "bronze/orders_raw.sql": (
            "CREATE TABLE proj.raw.orders_raw AS "
            "SELECT 1 AS order_id, 2 AS amount, 'x' AS status;"
        ),
        "silver/orders.sql": (
            "CREATE TABLE proj.stg.orders AS SELECT "
            "order_id, "
            "CASE WHEN amount > 100 THEN 'high' ELSE 'low' END AS band, "
            "amount * 2 AS doubled "
            "FROM proj.raw.orders_raw;"
        ),
    })

    tables = parse_sql_files(root, visible_node_ids=["orders"])

    qualified = tables["orders"].get("column_references_qualified")
    assert qualified, "qualify_columns produced nothing — the pass is being discarded"
    assert any("orders_raw" in source for source in qualified)
