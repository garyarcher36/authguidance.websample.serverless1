import {DefaultClientError} from './defaultClientError';

// Ranges for random error ids
const MIN_ERROR_ID = 10000;
const MAX_ERROR_ID = 99999;

/*
 * Represents a 500 error, which will be handled in a supportable manner
 */
export class ApiError extends Error {

    // Standard exception properties to log
    private readonly _statusCode: number;
    private readonly _errorCode: string;
    private readonly _instanceId: number;
    private readonly _utcTime: string;
    private _details: any;
    private _stackFrames: string[];

    /*
     * Construct an error from known fields
     */
    public constructor(errorCode: string, userMessage: string) {

        super(userMessage);

        // Give fields their default values
        this._statusCode = 500;
        this._errorCode = errorCode;
        this._instanceId = Math.floor(Math.random() * (MAX_ERROR_ID - MIN_ERROR_ID + 1) + MIN_ERROR_ID),
        this._utcTime = new Date().toISOString(),
        this._details = '';

        // Store stack frame details
        this._stackFrames = [];
        this.addToStackFrames(this.stack);

        // Ensure that instanceof works
        Object.setPrototypeOf(this, new.target.prototype);
    }

    public get details(): any {
        return this._details;
    }

    public set details(details: any) {
        this._details = details;
    }

    public get code(): string {
        return this._errorCode;
    }

    public get instanceId(): number {
        return this._instanceId;
    }

    /*
     * Add details to the stack data, from ourself or downstream errors
     */
    public addToStackFrames(stack: any) {
        const items = stack.split('\n').map((x: string) => x.trim()) as string[];
        items.forEach((i) => {
            this._stackFrames.push(i);
        });
    }

    /*
     * Return an object ready to log
     */
    public toLogFormat(apiName: string): any {

        const serviceError: any = {
            details: this._details,
        };

        // Include the stack trace as an array within the JSON object
        if (this.stack) {
            serviceError.stack = this._stackFrames;
        }

        return {
            statusCode: this._statusCode,
            clientError: this.toClientError(apiName).toResponseFormat(),
            serviceError,
        };
    }

    /*
     * Translate to a supportable error response to return to the API caller
     */
    public toClientError(apiName: string): DefaultClientError {

        // Return the error code to the client
        const error = new DefaultClientError(this._statusCode, this._errorCode, this.message);

        // Also indicate which API, where in logs and when the error occurred
        error.setExceptionDetails(apiName, this._instanceId, this._utcTime);
        return error;
    }
}