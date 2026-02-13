import os
import json
from parser import parse_sql_files, build_graph

def test_parser():
    # Path to sql_examples
    examples_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sql_examples"))
    print(f"Testing parser on: {examples_dir}")
    
    if not os.path.exists(examples_dir):
        print("Examples directory not found!")
        return

    tables = parse_sql_files(examples_dir)
    print(f"\nFound {len(tables)} tables:")
    for name, data in tables.items():
        print(f"- {name} (Layer: {data['layer']})")
        print(f"  Dependencies: {data['dependencies']}")

    nodes, edges = build_graph(tables)
    print(f"\nGraph constructed with {len(nodes)} nodes and {len(edges)} edges.")
    
    # Save output for inspection
    with open("graph_output.json", "w") as f:
        json.dump({"nodes": nodes, "edges": edges}, f, indent=2)
    print("\nGraph output saved to graph_output.json")

if __name__ == "__main__":
    test_parser()
