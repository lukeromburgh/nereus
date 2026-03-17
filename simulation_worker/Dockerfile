FROM python:3.10-slim
USER root
RUN apt-get update && apt-get install -y python3-pip libgl1-mesa-glx
RUN pip install celery redis pyvista meshio jinja2 requests
COPY . /app
WORKDIR /app
CMD ["celery", "-A", "tasks", "worker", "--loglevel=info"]