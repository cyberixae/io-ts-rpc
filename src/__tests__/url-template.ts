import * as Either_ from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';

import { expand, URI, URITemplate, URIVariables } from '../uri-template';

describe('uri-template module', () => {
  describe('expand function', () => {
    it('should expand URL template', () => {
      const template: URITemplate = '{+base}foo/{fooId}/bar';
      const variables: URIVariables = {
        base: 'https://example.com/',
        fooId: '123',
      };
      const result: URI | null = pipe(
        template,
        expand(variables),
        Either_.getOrElseW(() => null),
      );
      const expected: URI = 'https://example.com/foo/123/bar';
      expect(result).toEqual(expected);
    });
  });
});
