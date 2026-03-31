import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from routers import tabs, expenses

logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="Tabs API")
app.include_router(tabs.router)
app.include_router(expenses.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url)
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})


@app.get("/health")
def health():
    return {"status": "ok"}
