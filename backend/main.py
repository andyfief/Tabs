from fastapi import FastAPI
from routers import tabs

app = FastAPI(title="Tabs API")
app.include_router(tabs.router)


@app.get("/health")
def health():
    return {"status": "ok"}
