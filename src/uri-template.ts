import { Either } from 'fp-ts/lib/Either';
import * as Either_ from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';
import { parse } from 'url-template';

import { RpcError, rpcError } from './err';

export type URITemplate = string;
export type URI = string;
export type URIVariables = Record<string, string>;

export function expand(vars: URIVariables): (t: URITemplate) => Either<RpcError, URI> {
  return (template) =>
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
