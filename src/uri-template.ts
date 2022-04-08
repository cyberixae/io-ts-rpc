import { Either } from 'fp-ts/lib/Either';
import * as Either_ from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';
import urlTemplate from 'url-template';

import { Errors, singleError } from './err';

export type URITemplate = string;
export type URI = string;
export type URIVariables = Record<string, string>;

export function expand(vars: URIVariables): (t: URITemplate) => Either<Errors, URI> {
  return (template) =>
    pipe(
      Either_.tryCatch(
        () => urlTemplate.parse(template),
        (errors) =>
          singleError('io-ts-rpc client failed to parse url template', {
            template,
            errors,
          }),
      ),
      Either_.chain((expander) =>
        Either_.tryCatch(
          () => expander.expand(vars),
          (errors) =>
            singleError('io-ts-rpc client failed to expand url template', {
              input: JSON.parse(JSON.stringify(vars)),
              errors,
            }),
        ),
      ),
    );
}
