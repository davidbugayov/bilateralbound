#!/bin/bash
CLIENT_NAME=$1

if [ -z "$CLIENT_NAME" ]; then
    echo "Usage: $0 <client_name>"
    exit 1
fi

# Generate client key
ipsec pki --gen --type rsa --size 2048 --outform pem > /etc/ipsec.d/private/${CLIENT_NAME}-key.pem

# Generate certificate request
ipsec pki --pub --in /etc/ipsec.d/private/${CLIENT_NAME}-key.pem --type rsa | ipsec pki --issue --lifetime 1825 --cacert /etc/ipsec.d/cacerts/ca-cert.pem --cakey /etc/ipsec.d/private/ca-key.pem --dn "C=RU, O=BilateralBound, CN=${CLIENT_NAME}" --san "${CLIENT_NAME}" --outform pem > /etc/ipsec.d/certs/${CLIENT_NAME}-cert.pem

echo "Certificate created for client: $CLIENT_NAME"
echo "Files:"
echo "  Key: /etc/ipsec.d/private/${CLIENT_NAME}-key.pem"
echo "  Certificate: /etc/ipsec.d/certs/${CLIENT_NAME}-cert.pem"
echo "  CA certificate: /etc/ipsec.d/cacerts/ca-cert.pem"
