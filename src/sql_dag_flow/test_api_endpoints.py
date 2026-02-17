import requests
import json
import os

BASE_URL = "http://localhost:8000"

def test_scan_folders():
    print("Testing /scan/folders...")
    # Use current directory or a known one
    path = os.getcwd()
    print(f"Scanning path: {path}")
    response = requests.post(f"{BASE_URL}/scan/folders", json={"path": path})
    if response.status_code == 200:
        print("Success:", response.json())
    else:
        print("Failed:", response.status_code, response.text)

def test_graph_filtered():
    print("\nTesting /graph/filtered...")
    # Test with no subfolders (should return all)
    response = requests.post(f"{BASE_URL}/graph/filtered", json={"subfolders": None})
    if response.status_code == 200:
        nodes = response.json().get("nodes", [])
        print(f"Success (No filter): Got {len(nodes)} nodes")
    else:
        print("Failed (No filter):", response.status_code, response.text)

    # Test with empty subfolders (should return none if strict, or maybe empty list?)
    # Logic in parser: if allowed_subfolders is not None, it filters. If empty list, it matches nothing.
    response = requests.post(f"{BASE_URL}/graph/filtered", json={"subfolders": []})
    if response.status_code == 200:
        nodes = response.json().get("nodes", [])
        print(f"Success (Empty filter): Got {len(nodes)} nodes")
    else:
        print("Failed (Empty filter):", response.status_code, response.text)

if __name__ == "__main__":
    try:
        # Assumes backend is running. If not, this will fail connection.
        # pass
        print("Skipping actual request since I cannot ensure backend is running in this environment without user action.")
        print("Code for verification is ready.")
    except Exception as e:
        print(f"Error: {e}")
