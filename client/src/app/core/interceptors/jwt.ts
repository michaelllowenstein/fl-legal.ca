
import { HttpInterceptorFn } from '@angular/common/http';
import { env } from '@env/environment';
import { EditorService } from '@core/services/editor';
import { AuthService } from '@core/services/auth';
import { inject } from '@angular/core';
/**
 * Attaches the appropriate Bearer token to every outbound API call.
 *
 * Logic:
 *   1. If the request is not going to our API, pass through unchanged.
 *   2. Lawyer token takes priority (calendar routes).
 *   3. Editor token used for content PATCH routes.
 *   4. Calculator token used for calculator config writes.
 *   5. If neither is present, pass through — public routes need no auth.
 */
/**
 * JWT interceptor.
 *
 * Attaches the correct bearer token to every outbound /api request.
 * Works for both:
 *   • Same-origin production:  URL starts with /api/
 *   • Local dev:               URL contains localhost:8443/api/
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const isApiCall = req.url.includes('/api/');
  if (!isApiCall) return next(req);
  if (req.headers.has('Authorization')) return next(req);
 
  const auth: AuthService = inject(AuthService);
  const editor: EditorService = inject(EditorService);
 
  const token = auth.lawyerToken() ?? auth.editorToken() ?? auth.calcToken() ?? editor.token();
 
  if (token) {
    return next(req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }));
  }
  return next(req);
};
