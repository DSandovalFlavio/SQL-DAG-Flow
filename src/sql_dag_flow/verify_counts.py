from parser import parse_sql_files, build_graph
import os

# Use the example directory
base_dir = os.path.dirname(os.path.abspath(__file__))
sql_dir = os.path.join(base_dir, "../sql_examples")

print(f"Testing parser on: {sql_dir}")

tables = parse_sql_files(sql_dir)
nodes, edges = build_graph(tables)

print(f"\nGraph constructed with {len(nodes)} nodes and {len(edges)} edges.\n")

for node in nodes:
    data = node['data']
    print(f"- Node: {node['id']}")
    print(f"  Label: {data['label']}")
    print(f"  Incoming (Direct): {data.get('incomingCount')}")
    print(f"  Nested (Total): {data.get('nestedCount')}")
    print("-" * 20)
