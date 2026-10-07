"""Reconcile previously verified extraction repairs in an isolated SQLite snapshot."""
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = root / "outputs/aihot-review-20261004"
out.mkdir(parents=True, exist_ok=True)
(out / "source-db").mkdir(exist_ok=True)
(out / "release-db").mkdir(exist_ok=True)
source = sqlite3.connect((root / "data/invest.db").as_uri() + "?mode=ro", uri=True)
frozen = sqlite3.connect(out / "source-db/invest.db")
source.backup(frozen)
source.close()
working = sqlite3.connect(out / "release-db/invest.db")
frozen.backup(working)
frozen.close()
working.row_factory = sqlite3.Row
verified = sqlite3.connect((root / "outputs/quality-upgrade-20260926/working-db/invest.db").as_uri() + "?mode=ro", uri=True)
verified.row_factory = sqlite3.Row
now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
restored, skipped = [], []
output_tables = ["summaries", "article_judgments", "article_translations", "generation_basis", "summary_failures"]
with working:
    for item in verified.execute("SELECT DISTINCT article_id FROM article_content_revisions"):
        article_id = item[0]
        current = working.execute("SELECT * FROM articles WHERE id=?", (article_id,)).fetchone()
        repaired = verified.execute("SELECT * FROM articles WHERE id=?", (article_id,)).fetchone()
        if not current or not repaired or current["url"] != repaired["url"] or current["title"] != repaired["title"]:
            skipped.append({"id": article_id, "reason": "identity_changed"})
            continue
        revisions = verified.execute("SELECT raw_text,raw_html,published_at FROM article_content_revisions WHERE article_id=?", (article_id,)).fetchall()
        unchanged = any((current["raw_text"] or "") == (r["raw_text"] or "") and
                        (current["raw_html"] or "") == (r["raw_html"] or "") and
                        current["published_at"] == r["published_at"] for r in revisions)
        if not unchanged:
            skipped.append({"id": article_id, "reason": "source_changed_or_already_repaired"})
            continue
        old_output = working.execute("SELECT s.summary,j.content judgment,t.title_zh,b.source_fingerprint FROM articles a LEFT JOIN summaries s ON s.article_id=a.id LEFT JOIN article_judgments j ON j.article_id=a.id LEFT JOIN article_translations t ON t.article_id=a.id LEFT JOIN generation_basis b ON b.article_id=a.id WHERE a.id=?", (article_id,)).fetchone()
        if old_output and any(old_output[k] for k in ["summary", "judgment", "title_zh"]):
            working.execute("INSERT INTO generation_history(article_id,source_fingerprint,summary,judgment,title_zh,reason,archived_at) VALUES(?,?,?,?,?,?,?)", (article_id, old_output["source_fingerprint"] or "unrecorded", old_output["summary"], old_output["judgment"], old_output["title_zh"], "verified_extraction_reconciled_in_copy", now))
        working.execute("UPDATE articles SET raw_text=?,raw_html=?,content_hash=?,published_at=? WHERE id=?", (repaired["raw_text"], repaired["raw_html"], repaired["content_hash"], repaired["published_at"], article_id))
        for table in output_tables:
            working.execute(f"DELETE FROM {table} WHERE article_id=?", (article_id,))
            trusted = verified.execute(f"SELECT * FROM {table} WHERE article_id=?", (article_id,)).fetchone()
            if trusted:
                columns = [c for c in trusted.keys() if c != "id"]
                working.execute(f"INSERT INTO {table} ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})", tuple(trusted[c] for c in columns))
        restored.append(article_id)
verified.close()
assert working.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
working.close()
report = {"capturedAt": now, "sourceDbSha256": hashlib.sha256((out / "source-db/invest.db").read_bytes()).hexdigest(), "releaseDbSha256": hashlib.sha256((out / "release-db/invest.db").read_bytes()).hexdigest(), "restoredCount": len(restored), "restoredIds": restored, "skipped": skipped, "originalDatabaseWritten": False, "modelCalls": 0}
(out / "snapshot-reconciliation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({k: v for k, v in report.items() if k not in ["restoredIds", "skipped"]}, ensure_ascii=False))
