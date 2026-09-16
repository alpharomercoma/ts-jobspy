Test-only TLS material for test/ca-cert-proxy.test.ts: a throwaway self-signed CA
(ca.pem; its private key was discarded after signing) and a localhost server
certificate + key signed by it. Nothing here is a secret or is used outside the
unit tests.
