from pydantic import BaseModel, Field
from typing import Optional


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(LoginRequest):
    displayName: str


class PatchMeRequest(BaseModel):
    displayName: Optional[str] = None
    avatarUrl: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str


class RoomTimers(BaseModel):
    lobbyTimerSec: int = 45
    questionTimerSec: int = 30
    answerRevealSec: int = 10


class RoomSettings(BaseModel):
    privacy: str = "private"
    playerLimit: int = 20
    timers: RoomTimers = Field(default_factory=RoomTimers)


class CreateGameRequest(BaseModel):
    ownerUserId: str
    quizId: str
    title: str
    settings: RoomSettings = Field(default_factory=RoomSettings)


class JoinRequest(BaseModel):
    name: Optional[str] = None
    displayName: Optional[str] = None


class KickRequest(BaseModel):
    playerId: str


class QuizQuestion(BaseModel):
    id: Optional[str] = ""
    text: str
    options: list[str]
    correctIndex: Optional[int] = None


class CreateQuizRequest(BaseModel):
    ownerUserId: Optional[str] = None
    title: str
    description: str = ""
    questions: list[QuizQuestion] = Field(default_factory=list)


class UpdateQuizRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    questions: Optional[list[QuizQuestion]] = None


class StartAiQuizRequest(BaseModel):
    prompt: str
    desiredQuestionCount: int = 0
    difficulty: Optional[str] = None
    language: Optional[str] = None
    format: Optional[str] = None


class RegisterBotRequest(BaseModel):
    name: str
    version: str
    endpoint: str


class UpdateBotRequest(BaseModel):
    enabled: Optional[bool] = None
    reason: Optional[str] = None


class TelegramConnectRequest(BaseModel):
    token: str


class PromoRequest(BaseModel):
    code: str


class CheckoutRequest(BaseModel):
    planCode: str = "free"


class CallbackStatusRequest(BaseModel):
    paymentStatus: Optional[str] = None
    sessionId: Optional[str] = None


class BanRequest(BaseModel):
    reason: Optional[str] = ""
