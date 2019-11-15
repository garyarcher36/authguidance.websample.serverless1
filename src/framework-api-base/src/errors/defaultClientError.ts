import {ClientError} from './clientError';

/*
 * The default error object to return to the client
 * Business logic can also throw its own error types that implement IClientError
 */
export class DefaultClientError extends Error implements ClientError {

    /*
     * A helper method to return a 401 error
     */
    public static create401(reason: string): DefaultClientError {
        const error = new DefaultClientError(401, 'unauthorized', 'Missing, invalid or expired access token');
        error.LogContext = reason;
        return error;
    }

    /*
     * Fields in all client errors
     */
    private readonly _statusCode: number;
    private readonly _errorCode: string;
    private _logContext: any;

    /*
     * Extra fields for 500 errors
     */
    private _area: string;
    private _id: number;
    private _utcTime: string;

    /*
     * Construct from mandatory fields
     */
    public constructor(statusCode: number, errorCode: string, message: string) {

        // Set common fields
        super(message);
        this._statusCode = statusCode;
        this._errorCode = errorCode;
        this._logContext = null;

        // Initialise 5xx fields
        this._area = '';
        this._id = 0;
        this._utcTime = '';

        // Ensure that instanceof works
        Object.setPrototypeOf(this, new.target.prototype);
    }

    public getStatusCode(): number {
        return this._statusCode;
    }

    public getErrorCode(): string {
        return this._errorCode;
    }

    /*
     * A 4xx error can be thrown with additional data that is logged for support purposes
     */
    public set LogContext(value: any) {
        this._logContext = value;
    }

    /*
     * Set extra fields to return to the caller for 500 errors
     */
    public setExceptionDetails(area: string, id: number, utcTime: string) {
        this._area = area;
        this._id = id;
        this._utcTime = utcTime;
    }

    /*
     * Return an object that can be serialized by calling JSON.stringify
     */
    public toResponseFormat(): any {

        const body: any = {
            code: this._errorCode,
            message: this.message,
        };

        if (this._id > 0 && this._area.length > 0 && this._utcTime.length > 0) {
            body.id = this._id;
            body.area = this._area;
            body.utcTime = this._utcTime;
        }

        return body;
    }

    /*
     * The log format contains the response body, the status code and optional context
     */
    public toLogFormat(): any {

        const data: any = {
            statusCode: this._statusCode,
            clientError: this.toResponseFormat(),
        };

        if (this._logContext) {
            data.context = this._logContext;
        }

        return data;
    }
}