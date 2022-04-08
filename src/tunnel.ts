import * as Apply_ from 'fp-ts/lib/Apply';
import { Either } from 'fp-ts/lib/Either';
import * as Either_ from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';
import * as Task_ from 'fp-ts/lib/Task';
import * as TaskEither_ from 'fp-ts/lib/TaskEither';
import { TaskThese } from 'fp-ts/lib/TaskThese';
import { These } from 'fp-ts/lib/These';
import * as These_ from 'fp-ts/lib/These';
import { validator } from 'io-ts-validator';

import { Endpoint } from './endpoint';
import { Errors, singleError } from './err';
import { Body, Fetch, Headers, Method } from './fetch';
import * as Headers_ from './headers';
import { URI, URITemplate } from './uri-template';
import * as URITemplate_ from './uri-template';

type HTTPRequest = { url: URI; method: Method; headers: Headers; body: Body };
type HTTPResponse = { headers: Headers; body: Body };

type HTTPExchange = {
  request: HTTPRequest;
  response: HTTPResponse;
};

export type Tunnel<I, O> = (i: I) => TaskThese<Errors, O>;

export function tunnel<
  M extends Method,
  UT extends URITemplate,
  UV,
  HS,
  SS,
  TH extends Record<string, string>,
  TS,
>(
  method: M,
  target: UV,
  headers: HS,
  {
    targetHints,
    hrefTemplate,
    HrefTemplateVariables,
    ResponseHeaders,
    RequestHeaders,
    Request,
    Response,
  }: Endpoint<UT, UV, HS, SS, TH, TS>,
  fetch: Fetch,
): Tunnel<SS, TS> {
  function encodeUrl(template: UT, vars: UV): Either<Errors, URI> {
    return pipe(
      validator(HrefTemplateVariables).encodeEither(vars),
      Either_.mapLeft((errors: Array<string>) =>
        singleError('io-ts-rpc client failed to encode request url variables', {
          input: JSON.parse(JSON.stringify(vars)),
          errors: errors,
        }),
      ),
      Either_.chain((vars) => URITemplate_.expand(vars)(template)),
      Either_.chain((expanded) =>
        Either_.tryCatch(
          () => {
            if (expanded.includes('://') === false) {
              // relative URL
              return expanded;
            }
            return new URL(expanded).href;
          },
          (errors): Errors =>
            singleError('io-ts-rpc client failed to parse expanded request url', {
              expanded,
              errors,
            }),
        ),
      ),
    );
  }

  function encodeMethod(method: M): Either<Errors, Method> {
    const allowed = targetHints['allow']?.split(',') ?? [];
    if (allowed.includes(method)) {
      return Either_.right(method);
    }
    return Either_.left(singleError('Method not allowed', { method }));
  }

  function encodeHeaders(request: HS): Either<Errors, Headers> {
    return pipe(
      validator(RequestHeaders).encodeEither(request),
      Either_.mapLeft((errors: Array<string>) =>
        singleError('io-ts-rpc client failed to encode request headers', {
          input: JSON.parse(JSON.stringify(request)),
          errors: errors,
        }),
      ),
    );
  }

  function encodeRequest(request: SS): Either<Errors, Body> {
    return pipe(
      validator(Request, 'json').encodeEither(request),
      Either_.mapLeft((errors: Array<string>) =>
        singleError('io-ts-rpc client failed to stringify request body', {
          input: JSON.parse(JSON.stringify(request)),
          errors: errors,
        }),
      ),
    );
  }

  function parseResponseBody({ request, response }: HTTPExchange): Either<Errors, TS> {
    return pipe(
      validator(Response, 'json').decodeEither(response.body),
      Either_.mapLeft((errors: Array<string>) =>
        singleError('io-ts-rpc client failed to parse response body', {
          errors: errors,
          request,
          response,
        }),
      ),
    );
  }

  function parseResponseHeaders({
    request,
    response,
  }: HTTPExchange): These<Errors, Headers> {
    return pipe(
      validator(ResponseHeaders).decodeEither(response.headers),
      Either_.fold(
        (errors: Array<string>) =>
          These_.both(
            singleError('io-ts-rpc client failed to parse response headers', {
              errors: errors,
              request,
              response,
            }),
            response.headers,
          ),
        (_targetHints) => These_.right(response.headers),
      ),
    );
  }

  function parseResponse(exchange: HTTPExchange): These<Errors, TS> {
    return pipe(
      parseResponseBody(exchange),
      Either_.fold(
        (err) => These_.left(err),
        (body) =>
          pipe(
            parseResponseHeaders(exchange),
            These_.map((_headers) => body),
          ),
      ),
    );
  }

  return (request) =>
    pipe(
      {
        url: encodeUrl(hrefTemplate, target),
        method: encodeMethod(method),
        headers: encodeHeaders(headers),
        body: encodeRequest(request),
      },
      Apply_.sequenceS(Either_.Apply),
      Task_.of,
      TaskEither_.chain((encoded: HTTPRequest) =>
        TaskEither_.tryCatch(
          async (): Promise<HTTPExchange> => {
            const result = await fetch(encoded.url, {
              method: encoded.method,
              headers: encoded.headers,
              body: encoded.body,
            });
            const implicit: Headers = result.ok ? { allow: encoded.method } : {};
            const explicit: Headers = Headers_.fromFetchResult(result);
            return {
              request: encoded,
              response: {
                headers: {
                  ...implicit,
                  ...explicit,
                },
                body: await result.text(),
              },
            };
          },
          (error): Errors =>
            singleError('io-ts-rpc client failed to fetch response', {
              title: String(error),
              details: error,
              request: request,
            }),
        ),
      ),
      Task_.map(Either_.fold(These_.left, parseResponse)),
    );
}
