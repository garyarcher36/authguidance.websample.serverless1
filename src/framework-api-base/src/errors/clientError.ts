
/*
 * An interface to represent client error behaviour
 */
export interface ClientError {

    // Return the HTTP status code
    getStatusCode(): number;

    // Return the error code
    getErrorCode(): string;

    // Return the JSON response format
    toResponseFormat(): any;

    // Return the JSON log format
    toLogFormat(): any;
}