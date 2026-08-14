import argparse
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


parser = argparse.ArgumentParser(description="Create a consistent SQLite backup.")
parser.add_argument("--source", default="data/procurement.db")
parser.add_argument("--destination", default="backups")
args = parser.parse_args()

source = Path(args.source)
if not source.exists():
    raise SystemExit(f"Database not found: {source}")
destination_dir = Path(args.destination)
destination_dir.mkdir(parents=True, exist_ok=True)
timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
destination = destination_dir / f"procurement-{timestamp}.db"

with sqlite3.connect(source) as source_db, sqlite3.connect(destination) as backup_db:
    source_db.backup(backup_db)

print(destination.resolve())
