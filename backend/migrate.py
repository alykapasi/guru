# backend/migrate.py

import asyncio
import asyncpg
import pathlib
import re

DATABASE_URL = "postgresql://guru:guru123@localhost:5433/guru_db"

def split_sql(sql: str) -> list[str]:
    # Remove single-line comments
    sql = re.sub(r'--[^\n]*', '', sql)
    # Split on semicolons, filter out empty statements
    statements = [s.strip() for s in sql.split(';')]
    return [s for s in statements if s]

async def run():
    conn = await asyncpg.connect(DATABASE_URL)
    migration_files = sorted(pathlib.Path("migrations").glob("*.sql"))
    
    for f in migration_files:
        print(f"Running {f.name}...")
        statements = split_sql(f.read_text())
        for stmt in statements:
            await conn.execute(stmt)
        print(f"  ✓ done")
    
    await conn.close()
    print("\nAll migrations complete.")

asyncio.run(run())