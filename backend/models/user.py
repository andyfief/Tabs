from pydantic import BaseModel


class ProfileUpdate(BaseModel):
    display_name: str
    venmo_handle: str | None = None
    cashapp_handle: str | None = None
