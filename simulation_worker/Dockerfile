FROM openfoam/openfoam11-paraview510
USER root
RUN apt-get update && apt-get install -y python3-pip
RUN pip3 install celery redis pyvista meshio jinja2 requests
COPY . /app
WORKDIR /app
CMD ["celery", "-A", "tasks", "worker", "--loglevel=info"]