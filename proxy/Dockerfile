FROM nginx
COPY ./default.conf /etc/nginx/template.conf
COPY ./includes/ /etc/nginx/includes/
COPY ./run.sh /
ENTRYPOINT [ "bash", "/run.sh" ]