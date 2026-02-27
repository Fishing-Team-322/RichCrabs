use proto::richcrab::v1::auth_service_server::AuthService;
use proto::richcrab::v1::{
    AuthUser, ChangePasswordRequest, ChangePasswordResponse, EnsureSchemaRequest,
    EnsureSchemaResponse, GetAdminStatsRequest, GetAdminStatsResponse, GetMeRequest, GetMeResponse,
    LoginRequest, LoginResponse, LogoutRequest, LogoutResponse, RegisterRequest, RegisterResponse,
    SetUserBanRequest, SetUserBanResponse, UpdateProfileRequest, UpdateProfileResponse,
};
use sqlx::PgPool;
use tonic::{Request, Response, Status};

use crate::repository::{AuthRepository, StoredUser};

pub struct AuthServiceImpl {
    repository: AuthRepository,
}

impl AuthServiceImpl {
    pub fn new(pool: PgPool) -> Self {
        Self {
            repository: AuthRepository::new(pool),
        }
    }

    fn map_user(user: StoredUser) -> AuthUser {
        AuthUser {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            role: user.role,
            banned: user.banned,
        }
    }
}

#[tonic::async_trait]
impl AuthService for AuthServiceImpl {
    async fn ensure_schema(
        &self,
        _request: Request<EnsureSchemaRequest>,
    ) -> Result<Response<EnsureSchemaResponse>, Status> {
        self.repository
            .ensure_schema()
            .await
            .map_err(|e| Status::internal(format!("ensure schema failed: {e}")))?;
        Ok(Response::new(EnsureSchemaResponse {
            ok: true,
            error: None,
        }))
    }

    async fn register(
        &self,
        request: Request<RegisterRequest>,
    ) -> Result<Response<RegisterResponse>, Status> {
        let req = request.into_inner();
        match self
            .repository
            .create_user(&req.email, &req.password, &req.display_name)
            .await
        {
            Ok(user) => Ok(Response::new(RegisterResponse {
                created: true,
                email_taken: false,
                user: Some(Self::map_user(user)),
                error: None,
            })),
            Err(sqlx::Error::Database(db_err)) if db_err.is_unique_violation() => {
                Ok(Response::new(RegisterResponse {
                    created: false,
                    email_taken: true,
                    user: None,
                    error: None,
                }))
            }
            Err(e) => Err(Status::internal(format!("register failed: {e}"))),
        }
    }

    async fn login(
        &self,
        request: Request<LoginRequest>,
    ) -> Result<Response<LoginResponse>, Status> {
        let req = request.into_inner();
        let user = self
            .repository
            .verify_password(&req.email, &req.password)
            .await
            .map_err(|e| Status::internal(format!("login failed: {e}")))?;
        if let Some(user) = user {
            Ok(Response::new(LoginResponse {
                authenticated: true,
                user: Some(Self::map_user(user)),
                error: None,
            }))
        } else {
            Ok(Response::new(LoginResponse {
                authenticated: false,
                user: None,
                error: None,
            }))
        }
    }

    async fn logout(
        &self,
        _request: Request<LogoutRequest>,
    ) -> Result<Response<LogoutResponse>, Status> {
        Ok(Response::new(LogoutResponse {
            ok: true,
            error: None,
        }))
    }

    async fn get_me(
        &self,
        request: Request<GetMeRequest>,
    ) -> Result<Response<GetMeResponse>, Status> {
        let user_id = request
            .into_inner()
            .user_id
            .map(|u| u.value)
            .unwrap_or_default();
        let user = self
            .repository
            .find_user_by_id(&user_id)
            .await
            .map_err(|e| Status::internal(format!("get me failed: {e}")))?;
        if let Some(user) = user {
            Ok(Response::new(GetMeResponse {
                found: true,
                user: Some(Self::map_user(user)),
                error: None,
            }))
        } else {
            Ok(Response::new(GetMeResponse {
                found: false,
                user: None,
                error: None,
            }))
        }
    }

    async fn update_profile(
        &self,
        request: Request<UpdateProfileRequest>,
    ) -> Result<Response<UpdateProfileResponse>, Status> {
        let req = request.into_inner();
        let user_id = req.user_id.map(|u| u.value).unwrap_or_default();
        let user = self
            .repository
            .update_profile(
                &user_id,
                req.display_name.as_deref(),
                req.avatar_url.as_deref(),
            )
            .await
            .map_err(|e| Status::internal(format!("update profile failed: {e}")))?;
        if let Some(user) = user {
            Ok(Response::new(UpdateProfileResponse {
                updated: true,
                not_found: false,
                user: Some(Self::map_user(user)),
                error: None,
            }))
        } else {
            Ok(Response::new(UpdateProfileResponse {
                updated: false,
                not_found: true,
                user: None,
                error: None,
            }))
        }
    }

    async fn change_password(
        &self,
        request: Request<ChangePasswordRequest>,
    ) -> Result<Response<ChangePasswordResponse>, Status> {
        let req = request.into_inner();
        let user_id = req.user_id.map(|u| u.value).unwrap_or_default();
        let changed = self
            .repository
            .change_password(&user_id, &req.current_password, &req.new_password)
            .await
            .map_err(|e| Status::internal(format!("change password failed: {e}")))?;

        Ok(Response::new(ChangePasswordResponse {
            changed,
            mismatch: !changed,
            error: None,
        }))
    }

    async fn set_user_ban(
        &self,
        request: Request<SetUserBanRequest>,
    ) -> Result<Response<SetUserBanResponse>, Status> {
        let req = request.into_inner();
        let user_id = req.user_id.map(|u| u.value).unwrap_or_default();
        let found = self
            .repository
            .set_user_ban(&user_id, req.banned, &req.reason)
            .await
            .map_err(|e| Status::internal(format!("set user ban failed: {e}")))?;
        Ok(Response::new(SetUserBanResponse {
            updated: true,
            found,
            error: None,
        }))
    }

    async fn get_admin_stats(
        &self,
        _request: Request<GetAdminStatsRequest>,
    ) -> Result<Response<GetAdminStatsResponse>, Status> {
        let (users_count, games_count, active_rooms) = self
            .repository
            .load_admin_stats()
            .await
            .map_err(|e| Status::internal(format!("load admin stats failed: {e}")))?;
        Ok(Response::new(GetAdminStatsResponse {
            users_count,
            games_count,
            active_rooms,
            error: None,
        }))
    }
}
