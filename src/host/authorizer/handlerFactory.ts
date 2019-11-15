import {Context, Handler} from 'aws-lambda';
import * as fs from 'fs-extra';
import {Container} from 'inversify';
import {MiddlewareObject, Middy} from 'middy';
import {cors} from 'middy/middlewares';
import {AsyncHandler,
        DebugProxyAgentMiddleware,
        FrameworkBuilder,
        ResponseWriter} from '../../framework-api-base';
import {OAuthAuthorizerBuilder} from '../../framework-api-oauth';
import {SampleApiClaims} from '../claims/sampleApiClaims';
import {Configuration} from '../configuration/configuration';
import {SampleApiClaimsProvider} from './sampleApiClaimsProvider';

/*
 * A class to manage common lambda startup behaviour and injecting cross cutting concerns
 */
export class HandlerFactory {

    private readonly _container: Container;

    public constructor(container: Container) {
        this._container = container;
    }

    /*
     * Enrich a handler for a lambda authorizer
     */
    public enrichHandler(baseHandler: AsyncHandler): Handler {

        const framework = new FrameworkBuilder(this._container);

        try {
            // Load our JSON configuration then configure the framework
            const configuration = this._loadConfiguration();
            framework
                .configure(configuration.framework)
                .register();

            // Register OAuth framework dependencies
            const authorizerBuilder = new OAuthAuthorizerBuilder<SampleApiClaims>(this._container, configuration.oauth)
                .withClaimsSupplier(SampleApiClaims)
                .withCustomClaimsProviderSupplier(SampleApiClaimsProvider)
                .register();

            // Configure middleware for error handling and logging as early as possible
            const enrichedHandler = framework.configureMiddleware(baseHandler, true);

            // Create the authorization middleware
            const authorizerMiddleware = authorizerBuilder.createAuthorizer();

            // Add final middleware, and configure CORS and HTTPS debugging before the authorizer
            return this._applyApplicationMiddleware(enrichedHandler, configuration, authorizerMiddleware);

        } catch (e) {

            // Handle any startup exceptions
            return this._handleStartupError(framework, e);
        }
    }

    /*
     * Load the configuration JSON file
     */
    private _loadConfiguration(): Configuration {
        const configBuffer = fs.readFileSync('api.config.json');
        return JSON.parse(configBuffer.toString()) as Configuration;
    }

    /*
     * Apply application specific middleware for CORS and HTTP debugging, then add the authorizer middleware
     * This sequence ensures that the lambda can be debugged locally, and that it returns CORS headers correctly in AWS
     */
    private _applyApplicationMiddleware(
        handler: Middy<any, any>,
        configuration: Configuration,
        authorizerMiddleware: MiddlewareObject<any, any>): Middy<any, any> {

        return handler
            .use(cors({origins: configuration.api.trustedOrigins}))
            .use(new DebugProxyAgentMiddleware(configuration.api.useProxy, configuration.api.proxyUrl))
            .use(authorizerMiddleware);
    }

    /*
     * Ensure that any startup errors are logged and then return a handler that will provide the client response
     */
    private _handleStartupError(framework: FrameworkBuilder, error: any): Handler {

        const clientError = framework.handleStartupError(error);
        return async (e: any, c: Context) => {
            return ResponseWriter.objectResponse(500, clientError.toResponseFormat());
        };
    }
}
