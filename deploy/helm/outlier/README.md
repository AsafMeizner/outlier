# Outlier Helm chart

Runs Outlier on Kubernetes: one pod (SQLite on a persistent volume, party rooms in memory), a Service, and an
optional Ingress. Works on a cluster with no internet: the only image is Outlier's own.

## 1. Get the image into the cluster (offline)

The offline zip has the image at `docker/outlier-image.tar.gz` (tagged `outlier:offline`). Pick one:

```sh
# a private registry the cluster can pull from
docker load -i outlier-image.tar.gz
docker tag outlier:offline registry.internal:5000/outlier:offline
docker push registry.internal:5000/outlier:offline
#   then install with --set image.repository=registry.internal:5000/outlier

# k3s / RKE2 (on every node)
gunzip -k outlier-image.tar.gz && sudo k3s ctr images import outlier-image.tar

# kind
docker load -i outlier-image.tar.gz && kind load docker-image outlier:offline

# containerd without a registry (on every node)
gunzip -k outlier-image.tar.gz && sudo ctr -n k8s.io images import outlier-image.tar
```

## 2. Install

```sh
helm install outlier ./outlier -n outlier --create-namespace \
  --set timeZone=Asia/Jerusalem
```

Common settings (see `values.yaml` for all):

| Value | Default | Meaning |
|---|---|---|
| `image.repository` / `image.tag` | `outlier` / `offline` | where the image is |
| `timeZone` | `Asia/Jerusalem` | the daily puzzle starts at midnight here |
| `historyDays` | `30` | past days created on first start (each uses brand-new prompts) |
| `persistence.size` / `storageClass` / `existingClaim` | `1Gi` / default / none | the database volume |
| `persistence.keep` | `true` | keep the volume (and data) on `helm uninstall` |
| `ingress.enabled`, `ingress.host`, `ingress.className`, `ingress.tls.*` | off | expose it through an Ingress |
| `service.type` / `service.nodePort` | `ClusterIP` | or `NodePort` without an Ingress |
| `trustProxy` | `private` with an Ingress | proxies allowed to set `X-Forwarded-For` (rate limits, login lockout) |
| `secureCookies` | on with Ingress TLS | mark login cookies `Secure` when HTTPS ends at a proxy |

## 3. First-time setup

```sh
kubectl -n outlier logs deploy/outlier | grep "setup code"
```

Open `<address>/setup/<code>` and create the admin account. Then `helm test outlier -n outlier` checks the service.

## Notes

- Keep `replicas` at 1. The Deployment uses `Recreate`, so an upgrade stops the old pod before the new one starts.
- Back up the database: `kubectl -n outlier exec deploy/outlier -- node server/server.ts backup /data/backup.db`,
  then `kubectl cp`. Admins can also download a backup in the browser (Admin -> Import/Export).
- The container runs as user 1000 with a read-only root filesystem; it writes only to `/data` and `/tmp`.
- With TLS at the Ingress, also turn on your controller's HTTPS redirect and HSTS (for ingress-nginx:
  `nginx.ingress.kubernetes.io/ssl-redirect: "true"`; HSTS is on by default there).
