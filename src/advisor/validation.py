"""Pydantic input validation for all advisor API endpoints and chat tool calls.

Every field has an explicit bound. Validators reject anything that could cause
the scorer to produce nonsense, the serialiser to crash, or the AI to receive
a malformed tool result.
"""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator

# Dubai-realistic budget ceiling. 500M AED covers ultra-luxury;
# anything above is almost certainly a data-entry error.
_MAX_BUDGET_AED = 500_000_000
_MIN_BUDGET_AED = 50_000          # below this no residential unit exists

VALID_REGISTRATION_TYPES = {"Off-Plan", "Ready", "Both"}
VALID_RISK_TOLERANCES     = {"low", "medium", "high"}
VALID_OBJECTIVES          = {"commission", "deals"}

# Area names from DLD records never contain slashes, null bytes or dots.
# Reject anything that looks like a path traversal attempt.
_FORBIDDEN_CHARS = set('/\\.\x00')


def _no_path_traversal(v: str) -> str:
    if any(c in v for c in _FORBIDDEN_CHARS):
        raise ValueError(
            "Area name contains invalid characters. "
            "Use the exact area name from /api/areas."
        )
    return v.strip()


# ---------------------------------------------------------------------------
# Buyer request
# ---------------------------------------------------------------------------

class BuyerRequest(BaseModel):
    """Parameters for the buyer shortlist endpoint and the rank_buyer_areas tool."""

    budget_aed: float = Field(
        ...,
        gt=_MIN_BUDGET_AED,
        le=_MAX_BUDGET_AED,
        description="Total purchase budget in AED.",
    )
    registration_type: str = Field(
        default="Both",
        description="'Off-Plan', 'Ready', or 'Both'.",
    )
    property_type: str | None = Field(
        default=None,
        max_length=100,
        description="Optional DLD property type filter, e.g. 'Apartment'.",
    )
    top_n: int = Field(
        default=10,
        ge=1,
        le=50,
        description="How many areas to return.",
    )

    @field_validator("registration_type")
    @classmethod
    def valid_reg_type(cls, v: str) -> str:
        if v not in VALID_REGISTRATION_TYPES:
            raise ValueError(
                f"registration_type must be one of {sorted(VALID_REGISTRATION_TYPES)}."
            )
        return v


# ---------------------------------------------------------------------------
# Investor request
# ---------------------------------------------------------------------------

class InvestorRequest(BaseModel):
    """Parameters for the investor ranking endpoint and rank_investor_areas tool."""

    budget_aed: float = Field(
        ...,
        gt=_MIN_BUDGET_AED,
        le=_MAX_BUDGET_AED,
        description="Investment budget in AED.",
    )
    registration_type: str = Field(
        default="Both",
        description="'Off-Plan', 'Ready', or 'Both'.",
    )
    risk_tolerance: str = Field(
        default="medium",
        description="'low', 'medium', or 'high'.",
    )
    top_n: int = Field(
        default=10,
        ge=1,
        le=50,
    )

    @field_validator("registration_type")
    @classmethod
    def valid_reg_type(cls, v: str) -> str:
        if v not in VALID_REGISTRATION_TYPES:
            raise ValueError(
                f"registration_type must be one of {sorted(VALID_REGISTRATION_TYPES)}."
            )
        return v

    @field_validator("risk_tolerance")
    @classmethod
    def valid_risk(cls, v: str) -> str:
        v = v.lower()
        if v not in VALID_RISK_TOLERANCES:
            raise ValueError(
                f"risk_tolerance must be one of {sorted(VALID_RISK_TOLERANCES)}."
            )
        return v


# ---------------------------------------------------------------------------
# Area detail request (path param validated here for reuse in tool calls)
# ---------------------------------------------------------------------------

class AreaRequest(BaseModel):
    """Parameters for the area detail endpoint and get_area_data tool."""

    area: str = Field(..., min_length=1, max_length=120)
    registration_type: str = Field(default="Both")

    @field_validator("area")
    @classmethod
    def safe_area(cls, v: str) -> str:
        return _no_path_traversal(v)

    @field_validator("registration_type")
    @classmethod
    def valid_reg_type(cls, v: str) -> str:
        if v not in VALID_REGISTRATION_TYPES:
            raise ValueError(
                f"registration_type must be one of {sorted(VALID_REGISTRATION_TYPES)}."
            )
        return v


# ---------------------------------------------------------------------------
# Area comparison request
# ---------------------------------------------------------------------------

class CompareRequest(BaseModel):
    """Up to 5 areas compared side by side."""

    areas: list[str] = Field(..., min_length=2, max_length=5)
    registration_type: str = Field(default="Both")

    @field_validator("areas", mode="before")
    @classmethod
    def safe_areas(cls, v: list) -> list:
        return [_no_path_traversal(str(a)) for a in v]

    @field_validator("registration_type")
    @classmethod
    def valid_reg_type(cls, v: str) -> str:
        if v not in VALID_REGISTRATION_TYPES:
            raise ValueError(
                f"registration_type must be one of {sorted(VALID_REGISTRATION_TYPES)}."
            )
        return v


# ---------------------------------------------------------------------------
# Chat request
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    """Body for POST /api/chat."""

    messages: list[ChatMessage] = Field(..., min_length=1, max_length=20)
    persona: str = Field(
        default="buyer",
        description="'buyer' or 'investor' — switches the system prompt.",
    )

    @field_validator("persona")
    @classmethod
    def valid_persona(cls, v: str) -> str:
        v = v.lower()
        if v not in {"buyer", "investor"}:
            raise ValueError("persona must be 'buyer' or 'investor'.")
        return v
