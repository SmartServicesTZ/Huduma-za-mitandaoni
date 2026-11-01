#!/usr/bin/env python3
"""Reorder a D1 SQL export for statement-by-statement local restore.

Wrangler's local D1 executor sends statements independently, so an export that
places a child INSERT before its parent row can fail even when the dump sets
PRAGMA defer_foreign_keys. This utility keeps the original dump intact and
writes a second SQL file with table DDL first, data in FK dependency order,
sequence metadata next, and indexes last. It rejects unknown statements and
FK cycles rather than guessing.
"""
from __future__ import annotations

import argparse
import re
import sqlite3
from pathlib import Path


def split_sql(source: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    quote: str | None = None
    bracket_quote = False
    line_comment = False
    block_comment = False
    i = 0
    while i < len(source):
        ch = source[i]
        nxt = source[i + 1] if i + 1 < len(source) else ""
        if line_comment:
            if ch == "\n":
                line_comment = False
                current.append("\n")
            i += 1
            continue
        if block_comment:
            if ch == "*" and nxt == "/":
                block_comment = False
                i += 2
            else:
                i += 1
            continue
        if quote:
            current.append(ch)
            if ch == quote:
                if nxt == quote:
                    current.append(nxt)
                    i += 2
                    continue
                quote = None
            i += 1
            continue
        if bracket_quote:
            current.append(ch)
            if ch == "]":
                bracket_quote = False
            i += 1
            continue
        if ch == "-" and nxt == "-":
            line_comment = True
            i += 2
            continue
        if ch == "/" and nxt == "*":
            block_comment = True
            i += 2
            continue
        if ch in ("'", '"', "`"):
            quote = ch
            current.append(ch)
            i += 1
            continue
        if ch == "[":
            bracket_quote = True
            current.append(ch)
            i += 1
            continue
        if ch == ";":
            text = "".join(current).strip()
            if text:
                statements.append(text + ";")
            current.clear()
            i += 1
            continue
        current.append(ch)
        i += 1
    tail = "".join(current).strip()
    if tail:
        statements.append(tail)
    if quote or bracket_quote or block_comment:
        raise ValueError("unterminated quoted string or block comment in SQL dump")
    return statements


def object_name(statement: str, pattern: re.Pattern[str]) -> str | None:
    match = pattern.match(statement.strip())
    return match.group(1) if match else None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="original D1 SQL export (never modified)")
    parser.add_argument("output", type=Path, help="new ordered SQL restore file")
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit(f"Refusing to overwrite existing output: {args.output}")

    statements = split_sql(args.input.read_text(encoding="utf-8"))
    table_re = re.compile(r"^CREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`\[]?([A-Za-z_][A-Za-z0-9_]*)", re.I)
    index_re = re.compile(r"^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`\[]?([A-Za-z_][A-Za-z0-9_]*)", re.I)
    insert_re = re.compile(r"^(?:INSERT(?:\s+OR\s+[A-Z]+)?|REPLACE)\s+INTO\s+[\"`\[]?([A-Za-z_][A-Za-z0-9_]*)", re.I)

    table_ddls: list[tuple[str, str]] = []
    index_ddls: list[str] = []
    inserts: list[tuple[str, str]] = []
    sequence_statements: list[str] = []
    pragmas: list[str] = []
    for statement in statements:
        stripped = statement.strip()
        if re.match(r"^PRAGMA\b", stripped, re.I):
            pragmas.append(stripped)
            continue
        table = object_name(stripped, table_re)
        if table:
            table_ddls.append((table, stripped))
            continue
        if object_name(stripped, index_re):
            index_ddls.append(stripped)
            continue
        insert_table = object_name(stripped, insert_re)
        if insert_table:
            if insert_table.lower() == "sqlite_sequence":
                sequence_statements.append(stripped)
            else:
                inserts.append((insert_table, stripped))
            continue
        if re.match(r"^DELETE\s+FROM\s+[\"`\[]?sqlite_sequence\b", stripped, re.I):
            sequence_statements.append(stripped)
            continue
        raise ValueError(f"unsupported SQL statement; refusing to omit or reorder it: {stripped[:100]!r}")

    names = [name for name, _ in table_ddls]
    if len(names) != len(set(names)):
        raise ValueError("duplicate CREATE TABLE statement in export")
    table_names = set(names)
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    for _, ddl in table_ddls:
        db.execute(ddl)

    dependencies: dict[str, set[str]] = {name: set() for name in names}
    for table in names:
        for foreign_key in db.execute(f'PRAGMA foreign_key_list("{table}")'):
            parent = foreign_key[2]
            if parent in table_names and parent != table:
                dependencies[table].add(parent)
    order_index = {name: index for index, name in enumerate(names)}
    table_order: list[str] = []
    pending = set(names)
    while pending:
        ready = [name for name in pending if dependencies[name].isdisjoint(pending)]
        if not ready:
            raise ValueError(f"foreign-key cycle detected among tables: {sorted(pending)}")
        ready.sort(key=order_index.__getitem__)
        table_order.extend(ready)
        pending.difference_update(ready)
    db.close()

    inserts_by_table: dict[str, list[str]] = {name: [] for name in names}
    for table, statement in inserts:
        if table not in table_names:
            raise ValueError(f"INSERT targets a table with no CREATE TABLE statement: {table}")
        inserts_by_table[table].append(statement)

    output_statements = pragmas + [ddl for _, ddl in table_ddls]
    for table in table_order:
        output_statements.extend(inserts_by_table[table])
    output_statements.extend(sequence_statements)
    output_statements.extend(index_ddls)
    args.output.write_text("\n".join(output_statements) + "\n", encoding="utf-8")
    print(f"PASS: ordered {len(table_ddls)} tables, {len(inserts)} row inserts and {len(index_ddls)} indexes; parent tables precede dependent data.")
    print("Original backup was not modified; no data values were printed.")


if __name__ == "__main__":
    main()
