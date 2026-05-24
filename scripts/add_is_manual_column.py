import psycopg2

dbs = [
    "postgresql://postgres:postgres@localhost:5432/luxgrimoire_v2",
    "postgresql://postgres:postgres@localhost:5432/luxgrimoire_prodsnap",
]

for dsn in dbs:
    dbname = dsn.split("/")[-1]
    conn = psycopg2.connect(dsn)
    cur = conn.cursor()
    cur.execute(
        "ALTER TABLE edition_feature_tags ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE;"
    )
    conn.commit()
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name='edition_feature_tags' ORDER BY ordinal_position;"
    )
    cols = [r[0] for r in cur.fetchall()]
    print(f"{dbname}: {cols}")
    cur.close()
    conn.close()

print("Done")
