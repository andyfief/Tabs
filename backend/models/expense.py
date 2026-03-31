from pydantic import BaseModel, field_validator


class ExpenseCreate(BaseModel):
    title: str
    amount: float
    payer_id: str
    split_member_ids: list[str]

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Amount must be greater than zero.")
        return round(v, 2)

    @field_validator("split_member_ids")
    @classmethod
    def at_least_one_split(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one member must be in the split.")
        return v
