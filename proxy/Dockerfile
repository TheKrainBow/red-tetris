FROM nginx
COPY ./default.conf /etc/nginx/template.conf
COPY ./includes/ /etc/nginx/includes/
# COPY ./ssl/ /etc/ssl/certs/nginx/
COPY ./run.sh /
ENTRYPOINT [ "bash", "/run.sh" ]