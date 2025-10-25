import os
import sqlite3
from contextlib import contextmanager
from typing import Iterable, Dict, Any, List, Optional

DB_DIR = os.environ.get("DB_DIR", "/app/data")
DB_PATH = os.path.join(DB_DIR, "finscope.db")

os.makedirs(DB_DIR, exist_ok=True)

@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()

SCHEMA = """
CREATE TABLE IF NOT EXISTS timeseries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  metric TEXT,
  ts TEXT,
  value REAL,
  ingest_ts TEXT,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_timeseries_metric_ts ON timeseries(metric, ts);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  date TEXT,
  amount REAL,
  currency TEXT,
  name TEXT,
  category TEXT,
  account_id TEXT,
  raw JSON
);
"""

def init_db():
    with get_conn() as c:
        c.executescript(SCHEMA)
        c.commit()


def insert_timeseries(rows: Iterable[Dict[str, Any]]):
    sql = "INSERT INTO timeseries(source, metric, ts, value, ingest_ts, meta) VALUES(?,?,?,?,?,?)"
    with get_conn() as c:
        c.executemany(sql, [
            (
                r.get("source"),
                r.get("metric"),
                r.get("timestamp"),
                float(r.get("value")) if r.get("value") is not None else None,
                r.get("ingest_ts"),
                str(r.get("meta")) if r.get("meta") is not None else None,
            ) for r in rows
        ])
        c.commit()


def query_timeseries(metric: str, start: Optional[str] = None, end: Optional[str] = None) -> List[Dict[str, Any]]:
    q = "SELECT ts, value FROM timeseries WHERE metric=?"
    params: List[Any] = [metric]
    if start:
        q += " AND ts>=?"; params.append(start)
    if end:
        q += " AND ts<=?"; params.append(end)
    q += " ORDER BY ts ASC"
    with get_conn() as c:
        cur = c.execute(q, params)
        rows = cur.fetchall()
        return [{"timestamp": r[0], "value": r[1]} for r in rows]


def upsert_transaction(txn: Dict[str, Any]):
    # Accept Plaid transaction payloads and generic ones
    txn_id = txn.get("id") or txn.get("transaction_id") or txn.get("transactionId")
    currency = txn.get("currency") or txn.get("iso_currency_code") or txn.get("unofficial_currency_code")
    category_val = txn.get("category")
    if isinstance(category_val, list):
        category_str = ",".join(category_val)
    elif category_val is None:
        category_str = None
    else:
        category_str = str(category_val)

    sql = (
        "INSERT INTO transactions(id, date, amount, currency, name, category, account_id, raw) "
        "VALUES(?,?,?,?,?,?,?, ?) "
        "ON CONFLICT(id) DO UPDATE SET date=excluded.date, amount=excluded.amount, currency=excluded.currency, "
        "name=excluded.name, category=excluded.category, account_id=excluded.account_id, raw=excluded.raw"
    )
    with get_conn() as c:
        c.execute(sql, (
            txn_id, txn.get("date"), float(txn.get("amount")), currency, txn.get("name"),
            category_str,
            txn.get("account_id"),
            json_dumps_safe(txn)
        ))
        c.commit()


def json_dumps_safe(obj: Any) -> str:
    try:
        import json
        return json.dumps(obj)
    except Exception:
        return "{}"
