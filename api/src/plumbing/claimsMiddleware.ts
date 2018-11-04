import * as middy from 'middy';
import {Configuration} from '../configuration/configuration';
import {OAuthConfiguration} from '../configuration/oauthConfiguration';
import {AuthorizationMicroservice} from '../logic/authorizationMicroservice';
import {ApiLogger} from './apiLogger';
import {Authenticator} from './authenticator';
import {ClaimsCache} from './claimsCache';
import {ErrorHandler} from './errorHandler';
import {ResponseHandler} from './responseHandler';

/*
 * The middleware coded in a class based manner
 */
class ClaimsMiddleware {

    /*
     * Dependencies
     */
    private _oauthConfig: OAuthConfiguration;
    private _authorizationMicroservice: AuthorizationMicroservice;

    /*
     * Receive configuration
     */
    public constructor(oauthConfig: OAuthConfiguration, authorizationMicroservice: AuthorizationMicroservice) {
        this._oauthConfig = oauthConfig;
        this._authorizationMicroservice = authorizationMicroservice;
        this._setupCallbacks();
    }

    /*
     * Do the authorization and set claims
     */
    public async onBefore(handler: middy.IHandlerLambda<any, object>, next: middy.IMiddyNextFunction): Promise<any> {

        try {
            // First read the token from the request header and report missing tokens
            const accessToken = this._readToken(handler.event.headers.authorization);
            if (accessToken === null) {
                ApiLogger.info('Claims Middleware', 'No access token received');
                handler.response = ResponseHandler.missingTokenResponse();
                return;
            }

            // Bypass validation and use cached results if they exist
            const cachedClaims = ClaimsCache.getClaimsForToken(accessToken);
            if (cachedClaims !== null) {
                handler.event.claims = cachedClaims;
                return next();
            }

            // Otherwise start by introspecting the token
            const authenticator = new Authenticator(this._oauthConfig);
            const result = await authenticator.validateTokenAndGetTokenClaims(accessToken);

            // Handle invalid or expired tokens
            if (!result.isValid) {
                ApiLogger.info('Claims Middleware', 'Invalid or expired access token received');
                handler.response = ResponseHandler.invalidTokenResponse();
                return;
            }

            // Next add central user info to claims
            await authenticator.getCentralUserInfoClaims(result.claims!, accessToken);

            // Next add product user data to claims
            await this._authorizationMicroservice.getProductClaims(result.claims!, accessToken);

            // Next cache the results
            ClaimsCache.addClaimsForToken(accessToken, result.expiry!, result.claims!);

            // Then move onto the API controller to execute business logic
            ApiLogger.info('Claims Middleware', 'Claims lookup completed successfully');
            handler.event.claims = result.claims;
            return next();

        } catch (e) {

            // Report any exceptions
            const serverError = ErrorHandler.fromException(e);
            const [statusCode, clientError] = ErrorHandler.handleError(serverError);
            handler.response = ResponseHandler.objectResponse(statusCode, clientError);
        }
    }

    /*
     * Try to read the token from the authorization header
     */
    private _readToken(authorizationHeader: string | undefined): string | null {

        if (authorizationHeader) {
            const parts = authorizationHeader.split(' ');
            if (parts.length === 2 && parts[0] === 'Bearer') {
                return parts[1];
            }
        }

        return null;
    }

    /*
     * Plumbing to ensure that the this parameter is available in async callbacks
     */
    private _setupCallbacks(): void {
        this.onBefore = this.onBefore.bind(this);
    }
}

/*
 * Do the export plumbing
 */
export function claimsMiddleware(config: Configuration, authService: AuthorizationMicroservice): middy.IMiddyMiddlewareObject {

    const middleware = new ClaimsMiddleware(config.oauth, authService);
    return {
        before: middleware.onBefore
    };
}
