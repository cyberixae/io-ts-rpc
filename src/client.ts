import * as Apply_ from 'fp-ts/lib/Apply';
import * as Array_ from 'fp-ts/lib/Array';
import * as Console_ from 'fp-ts/lib/Console';
import { Either, either as Either__ } from 'fp-ts/lib/Either';
import * as Either_ from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';
import * as IO_ from 'fp-ts/lib/IO';
import { Task } from 'fp-ts/lib/Task';
import * as Task_ from 'fp-ts/lib/Task';
import { TaskEither } from 'fp-ts/lib/TaskEither';
import * as TaskEither_ from 'fp-ts/lib/TaskEither';
import * as t from 'io-ts';
import { validator } from 'io-ts-validator';
import { parse } from 'url-template';

export type HeaderName = string;
export type HeaderCSV = unknown;
export type Body = string;
export type FetchLocation = string;
export type FetchOptions = {
  method: string;
  headers: Record<HeaderName, string>;
  body: Body;
};
export type FetchResult = {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
  headers: {
    forEach: (cb: (n: HeaderName, csv: HeaderCSV) => void) => void;
  };
};

export type Fetch = (u: FetchLocation, o: FetchOptions) => Promise<FetchResult>;

type Warnings = Array<RpcError>;
type These<E, A> = {
  body: A;
  warnings: E;
};
type URI = string;
type URITemplate = string;
type URIVariables = Record<string, string>;
type Headers = Record<HeaderName, HeaderCSV>;

function fromFetchResult(result: FetchResult): Headers {
  const tmp: Array<[HeaderName, HeaderCSV]> = [];
  result.headers.forEach((name, csv) => {
    tmp.push([name, csv]);
  });
  return Object.fromEntries(tmp);
}

type Json = unknown;

type Response = {
  headers: Headers;
  body: Body;
};

export type RpcError = {
  reason: string;
  debug?: Record<string, unknown>;
};
export const rpcError = (reason: string, debug?: Record<string, unknown>): RpcError => ({
  reason,
  debug,
});

function expandURITemplate(
  template: URITemplate,
): (vars: URIVariables) => Either<RpcError, URI> {
  return (vars) =>
    pipe(
      Either_.tryCatch(
        () => parse(template),
        (errors) =>
          rpcError('io-ts-rpc client failed to parse url template', {
            template,
            errors,
          }),
      ),
      Either_.chain((expander) =>
        Either_.tryCatch(
          () => expander.expand(vars),
          (errors) =>
            rpcError('io-ts-rpc client failed to expand url template', {
              input: JSON.parse(JSON.stringify(vars)),
              errors,
            }),
        ),
      ),
    );
}

type Method = 'POST' | 'GET';
type RPCMethod = NonNullable<RequestInit['method']>;

export type Endpoint<UT, UV, HS, SS, TH, TS> = {
  hrefTemplate: UT;
  HrefTemplateVariables: t.Type<UV, URIVariables>;
  RequestHeaders: t.Type<HS, Headers>;
  Request: t.Type<SS, Json>;
  ResponseHeaders: t.Type<TH, Headers>;
  targetHints: TH;
  Response: t.Type<TS, Json>;
};
export const endpoint = <UT, UV, HS, SS, TH, TS>(
  hrefTemplate: UT,
  HrefTemplateVariables: t.Type<UV, URIVariables>,
  RequestHeaders: t.Type<HS, Headers>,
  Request: t.Type<SS, Json>,
  ResponseHeaders: t.Type<TH, Headers>,
  targetHints: TH,
  Response: t.Type<TS, Json>,
): Endpoint<UT, UV, HS, SS, TH, TS> => ({
  hrefTemplate,
  HrefTemplateVariables,
  RequestHeaders,
  Request,
  ResponseHeaders,
  targetHints,
  Response,
});

/* eslint-disable @typescript-eslint/naming-convention */
export type HyperSchema<UT, UV, HS, SS, TH, TS> = {
  default_links_implementation_TargetHints: TH;
  default_links_implementation_Href: UT;
  _links_implementation_HrefSchema: t.Type<UV, URIVariables>;
  _links_implementation_TargetHints: t.Type<TH, Headers>;
  _links_implementation_HeaderSchema: t.Type<HS, Headers>;
  _links_implementation_SubmissionSchema: t.Type<SS, Json>;
  _links_implementation_TargetSchema: t.Type<TS, Json>;
};

export function fromHyperSchema<UT, UV, HS, SS, TH, TS>(
  hyper: HyperSchema<UT, UV, HS, SS, TH, TS>,
): Endpoint<UT, UV, HS, SS, TH, TS> {
  const {
    default_links_implementation_TargetHints,
    default_links_implementation_Href,
    _links_implementation_HrefSchema,
    _links_implementation_TargetHints,
    _links_implementation_HeaderSchema,
    _links_implementation_SubmissionSchema,
    _links_implementation_TargetSchema,
  } = hyper;

  return endpoint(
    default_links_implementation_Href,
    _links_implementation_HrefSchema,
    _links_implementation_HeaderSchema,
    _links_implementation_SubmissionSchema,
    _links_implementation_TargetHints,
    default_links_implementation_TargetHints,
    _links_implementation_TargetSchema,
  );
}
/* eslint-enable @typescript-eslint/naming-convention */

export type Tunnel<I, O> = (i: I) => TaskEither<RpcError, O>;

export function tunnel<
  M extends Method,
  UT extends URITemplate,
  UV,
  HS,
  SS,
  TH extends Record<string, string>,
  TS
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
  function encodeUrl(template: UT, vars: UV): Either<RpcError, URI> {
    return pipe(
      validator(HrefTemplateVariables).encodeEither(vars),
      Either_.mapLeft((errors: Array<string>) =>
        rpcError('io-ts-rpc client failed to encode request url variables', {
          input: JSON.parse(JSON.stringify(vars)),
          errors: errors,
        }),
      ),
      Either_.chain(expandURITemplate(template)),
      Either_.chain((expanded) =>
        Either_.tryCatch(
          () => {
            if (expanded.includes('://') === false) {
              // relative URL
              return expanded;
            }
            return new URL(expanded).href;
          },
          (errors): RpcError =>
            rpcError('io-ts-rpc client failed to parse expanded request url', {
              expanded,
              errors,
            }),
        ),
      ),
    );
  }

  function encodeMethod(method: M): Either<RpcError, RPCMethod> {
    const allowed = targetHints?.allow?.split(',') ?? [];
    if (allowed.includes(method)) {
      return Either_.right(method);
    }
    return Either_.left(rpcError('Method not allowed', { method }));
  }

  function encodeHeaders(request: HS): Either<RpcError, Headers> {
    return pipe(
      validator(RequestHeaders).encodeEither(request),
      Either_.mapLeft((errors: Array<string>) =>
        rpcError('io-ts-rpc client failed to encode request headers', {
          input: JSON.parse(JSON.stringify(request)),
          errors: errors,
        }),
      ),
    );
  }

  function encodeRequest(request: SS): Either<RpcError, Body> {
    return pipe(
      validator(Request, 'json').encodeEither(request),
      Either_.mapLeft((errors: Array<string>) =>
        rpcError('io-ts-rpc client failed to stringify request body', {
          input: JSON.parse(JSON.stringify(request)),
          errors: errors,
        }),
      ),
    );
  }

  function parseBody(body: Body): Either<RpcError, TS> {
    return pipe(
      validator(Response, 'json').decodeEither(body),
      Either_.mapLeft((errors: Array<string>) =>
        rpcError('io-ts-rpc client failed to parse response body', {
          input: JSON.parse(JSON.stringify(body)),
          errors: errors,
        }),
      ),
    );
  }

  function parseHeaders(headers: Headers): Either<RpcError, Warnings> {
    return pipe(
      headers,
      validator(ResponseHeaders).decodeEither,
      Either_.fold(
        (errors: Array<string>) =>
          Either_.right([
            rpcError('io-ts-rpc client failed to parse response headers', {
              input: JSON.parse(JSON.stringify(headers)),
              errors: errors,
            }),
          ]),
        (_targetHints) => Either_.right([]),
      ),
    );
  }

  function parseResponse({
    body,
    headers,
  }: Response): Either<RpcError, These<Warnings, TS>> {
    return pipe(
      {
        body: parseBody(body),
        warnings: parseHeaders({
          ...headers,
          allow: 'POST', // allow: 'POST' is implicit when code is 200
        }),
      },
      Apply_.sequenceS(Either__),
    );
  }

  function logWarnings<T>(theseWarnings: These<Warnings, T>): Task<T> {
    return pipe(
      Task_.of(theseWarnings),
      Task_.chainFirst(({ warnings }) =>
        pipe(warnings, Array_.map(Console_.warn), IO_.sequenceArray, Task_.fromIO),
      ),
      Task_.map(({ body }) => body),
    );
  }

  return (request) =>
    pipe(
      {
        url: encodeUrl(hrefTemplate, target),
        method: encodeMethod(method),
        headers: encodeHeaders(headers),
        request: encodeRequest(request),
      },
      Apply_.sequenceS(Either__),
      Task_.of,
      TaskEither_.chain(
        (encoded: {
          url: URI;
          method: RPCMethod;
          headers: Headers;
          request: Body;
        }): TaskEither<RpcError, Response> =>
          pipe(
            TaskEither_.tryCatch(
              async (): Promise<Response> => {
                const result = await fetch(encoded.url, {
                  method: encoded.method,
                  headers: encoded.headers as Record<string, string>,
                  body: encoded.request,
                });

                if (result.ok === false) {
                  // eslint-disable-next-line fp/no-throw
                  throw new Error(
                    `${result.status}: ${result.statusText}, while calling ${encoded.url} with ${encoded.request}`,
                  );
                }
                const response: Response = {
                  headers: fromFetchResult(result),
                  body: await result.text(),
                };
                return response;
              },
              (error): RpcError =>
                rpcError('io-ts-rpc client failed to fetch response', {
                  title: String(error),
                  details: error,
                  request: request,
                }),
            ),
          ),
      ),
      TaskEither_.chainEitherK(parseResponse),
      TaskEither_.chain(
        (these): TaskEither<RpcError, TS> =>
          pipe(logWarnings(these), Task_.map(Either_.right)),
      ),
    );
}
