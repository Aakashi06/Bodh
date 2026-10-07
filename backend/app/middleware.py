"""Small, process-local request limits for the demo backend."""
from collections import defaultdict, deque
from time import monotonic

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings


class RequestLimits(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.requests = defaultdict(deque)

    async def dispatch(self, request, call_next):
        if request.url.path.startswith("/api/"):
            # Bound the multipart envelope as well as the extracted audio file.
            length = request.headers.get("content-length")
            if length:
                try:
                    if int(length) > 9 * 1024 * 1024:
                        return JSONResponse({"detail": "Request is too large."}, status_code=413)
                except ValueError:
                    return JSONResponse({"detail": "Invalid request size."}, status_code=400)
            host = request.client.host if request.client else "unknown"
            now = monotonic()
            # Prune inactive clients so the limiter itself stays bounded.
            for client in list(self.requests):
                if not self.requests[client] or self.requests[client][-1] <= now - 60:
                    del self.requests[client]
            recent = self.requests[host]
            while recent and recent[0] <= now - 60:
                recent.popleft()
            if len(recent) >= settings.requests_per_minute:
                return JSONResponse({"detail": "Too many requests. Please wait a minute."}, status_code=429,
                                    headers={"Retry-After": "60"})
            recent.append(now)
        return await call_next(request)
