FROM ghost:5-alpine

USER root

# Pre-install the Cloudinary storage adapter into Ghost's node_modules.
# We do NOT copy to content/adapters here because Coolify mounts
# /var/lib/ghost/content as a volume — anything placed there in the
# Dockerfile layer is overwritten at container start.
# The entrypoint script copies it after the volume is mounted.
RUN cd /var/lib/ghost && \
    npm install --no-save ghost-storage-cloudinary && \
    chown -R node:node node_modules

COPY setup-cloudinary.sh /setup-cloudinary.sh
RUN chmod +x /setup-cloudinary.sh

# Wrap Ghost's original entrypoint
ENTRYPOINT ["/setup-cloudinary.sh"]
CMD ["node", "current/index.js"]
