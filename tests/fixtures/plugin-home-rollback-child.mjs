import { DatabaseSync } from "node:sqlite";

// Hold an actual rollback-journal write after cache spill, until the test process stops this child.
const [file, version, owner] = process.argv.slice(2);
const db = new DatabaseSync(file);
db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA cache_size=8; PRAGMA cache_spill=ON; BEGIN IMMEDIATE");
db.prepare("UPDATE facts SET owner=?, value='staged' WHERE id=1").run(owner);
db.exec(`PRAGMA user_version=${Number(version)}`);
db.prepare("UPDATE padding SET payload=randomblob(?) WHERE id=1").run(8 * 1024 * 1024);
process.stdout.write("staged\n");
setInterval(() => {}, 1000);
