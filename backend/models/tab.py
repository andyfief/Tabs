from pydantic import BaseModel


class TabCreate(BaseModel):
    name: str
    description: str | None = None
