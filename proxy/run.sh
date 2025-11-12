envsubst '$REACT_APP_HOST' < /etc/nginx/template.conf > /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"