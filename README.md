# io-ts-rpc

Io-ts-rpc is an RPC client that uses [io-ts](https://github.com/gcanti/io-ts) codecs. For decoding input and encoding output. The codecs themself are described in greater detail in the [io-ts guide](https://github.com/gcanti/io-ts/blob/master/index.md). If you have existing JSON Hyper Schema definitions for your endpoints you can use [io-ts-from-json-schema](https://www.npmjs.com/package/io-ts-from-json-schema) to convert your hyper schema into io-ts endpoint definitions. Complementary [io-ts-validator](https://www.npmjs.com/package/io-ts-validator) provides convenience features for using the same codecs for validating non-network related inputs.
