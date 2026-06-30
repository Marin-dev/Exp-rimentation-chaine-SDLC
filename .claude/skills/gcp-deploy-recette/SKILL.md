# Skill : gcp-deploy-recette

## Quand utiliser ce skill

Déclencher ce skill quand l'utilisateur demande :
- Déployer sur GCP / recette / staging
- Créer des Dockerfiles pour les services DocuPost
- Configurer Cloud Run, Cloud Build, Cloud SQL
- Mettre en place le pipeline CI/CD GCP
- Configurer les variables d'environnement pour l'environnement recette
- "Pousser sur GCP", "mettre en recette", "déployer en staging"

## Contexte DocuPost

Stack à déployer :
| Service | Technologie | Port local | Cible GCP |
|---------|------------|-----------|-----------|
| `svc-tournee` | Spring Boot (Java) | 8081 | Cloud Run |
| `svc-supervision` | Spring Boot (Java) | 8082 | Cloud Run |
| `frontend-supervision` | React | 3000 | Cloud Run ou Firebase Hosting |
| `app-mobile` | Expo Web | 8083 | Cloud Run (build web) |

Infrastructure recommandée :
- **Cloud Run** : services backend et frontend (serverless, scale-to-zero)
- **Cloud SQL (PostgreSQL)** : base de données persistante
- **Secret Manager** : variables sensibles (DB passwords, JWT secrets)
- **Artifact Registry** : images Docker
- **Cloud Build** : CI/CD automatisé
- **Cloud Load Balancing** : point d'entrée unique (optionnel)

## Protocole d'exécution

### Étape 1 — Vérification des prérequis

Avant toute action, vérifier :

```bash
# GCP CLI installé et configuré
gcloud version
gcloud auth list
gcloud config get-value project

# Docker disponible
docker --version
```

Si `gcloud` n'est pas configuré, demander à l'utilisateur :
```
! gcloud auth login
! gcloud config set project [PROJECT_ID]
```

### Étape 2 — Variables de configuration à collecter

Demander (ou lire depuis les fichiers existants) :
- `GCP_PROJECT_ID` : ID du projet GCP (ex. `docupost-recette`)
- `GCP_REGION` : région (ex. `europe-west1`)
- `GCP_REPO` : nom du dépôt Artifact Registry (ex. `docupost`)
- `DB_INSTANCE` : nom de l'instance Cloud SQL (ex. `docupost-db`)
- `DB_NAME` : nom de la base de données (ex. `docupost_recette`)

### Étape 3 — Création des Dockerfiles

#### `src/backend/svc-tournee/Dockerfile`

```dockerfile
# Build stage
FROM eclipse-temurin:20-jdk-alpine AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN apk add --no-cache maven && mvn package -DskipTests -q

# Runtime stage
FROM eclipse-temurin:20-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8081
ENV SPRING_PROFILES_ACTIVE=recette
ENTRYPOINT ["java", "-jar", "app.jar"]
```

#### `src/backend/svc-supervision/Dockerfile`

Identique à svc-tournee, `EXPOSE 8082`.

#### `src/web/supervision/Dockerfile`

```dockerfile
# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG REACT_APP_API_URL
ARG REACT_APP_SUPERVISION_URL
RUN npm run build

# Serve stage
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

#### `src/mobile/Dockerfile` (Expo Web)

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_SUPERVISION_URL
RUN npx expo export --platform web

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### Étape 4 — nginx.conf (pour les frontends)

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /health {
        return 200 'ok';
        add_header Content-Type text/plain;
    }
}
```

### Étape 5 — Cloud Build (`cloudbuild.yaml`)

Créer à la racine du projet :

```yaml
steps:
  # Build & push svc-tournee
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - build
      - '-t'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/svc-tournee:$COMMIT_SHA'
      - 'src/backend/svc-tournee'
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/svc-tournee:$COMMIT_SHA']

  # Build & push svc-supervision
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - build
      - '-t'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/svc-supervision:$COMMIT_SHA'
      - 'src/backend/svc-supervision'
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/svc-supervision:$COMMIT_SHA']

  # Build & push frontend-supervision
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - build
      - '--build-arg'
      - 'REACT_APP_API_URL=${_SVC_SUPERVISION_URL}'
      - '-t'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/frontend-supervision:$COMMIT_SHA'
      - 'src/web/supervision'
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/frontend-supervision:$COMMIT_SHA']

  # Deploy svc-tournee sur Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - run
      - deploy
      - svc-tournee
      - '--image=${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/svc-tournee:$COMMIT_SHA'
      - '--region=${_REGION}'
      - '--platform=managed'
      - '--allow-unauthenticated'
      - '--port=8081'
      - '--set-secrets=SPRING_DATASOURCE_PASSWORD=db-password:latest'
      - '--set-env-vars=SPRING_PROFILES_ACTIVE=recette'

  # Deploy svc-supervision sur Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - run
      - deploy
      - svc-supervision
      - '--image=${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/svc-supervision:$COMMIT_SHA'
      - '--region=${_REGION}'
      - '--platform=managed'
      - '--allow-unauthenticated'
      - '--port=8082'
      - '--set-secrets=SPRING_DATASOURCE_PASSWORD=db-password:latest'
      - '--set-env-vars=SPRING_PROFILES_ACTIVE=recette'

  # Deploy frontend-supervision sur Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - run
      - deploy
      - frontend-supervision
      - '--image=${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/frontend-supervision:$COMMIT_SHA'
      - '--region=${_REGION}'
      - '--platform=managed'
      - '--allow-unauthenticated'
      - '--port=80'

substitutions:
  _REGION: europe-west1
  _REPO: docupost
  _SVC_SUPERVISION_URL: https://svc-supervision-XXXX-ew.a.run.app

images:
  - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/svc-tournee:$COMMIT_SHA'
  - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/svc-supervision:$COMMIT_SHA'
  - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/frontend-supervision:$COMMIT_SHA'
```

### Étape 6 — Profil Spring Boot `recette`

Créer `src/backend/svc-tournee/src/main/resources/application-recette.yml` :

```yaml
spring:
  datasource:
    url: jdbc:postgresql:///docupost_recette?cloudSqlInstance=${DB_INSTANCE}&socketFactory=com.google.cloud.sql.postgres.SocketFactory
    username: docupost
    password: ${SPRING_DATASOURCE_PASSWORD}
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false

server:
  port: 8081
```

Même chose pour `svc-supervision` (port 8082, DB peut être partagée ou séparée).

### Étape 7 — Déploiement initial (une fois)

Commandes à exécuter **une seule fois** pour provisionner l'infrastructure :

```bash
# Variables
PROJECT_ID="docupost-recette"
REGION="europe-west1"
REPO="docupost"
DB_INSTANCE="docupost-db"

# Activer les APIs nécessaires
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  --project=$PROJECT_ID

# Créer le dépôt Artifact Registry
gcloud artifacts repositories create $REPO \
  --repository-format=docker \
  --location=$REGION \
  --project=$PROJECT_ID

# Créer l'instance Cloud SQL PostgreSQL
gcloud sql instances create $DB_INSTANCE \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=$REGION \
  --project=$PROJECT_ID

# Créer la base et l'utilisateur
gcloud sql databases create docupost_recette --instance=$DB_INSTANCE --project=$PROJECT_ID
gcloud sql users create docupost --instance=$DB_INSTANCE --password=CHANGE_ME --project=$PROJECT_ID

# Stocker le mot de passe dans Secret Manager
echo -n "CHANGE_ME" | gcloud secrets create db-password \
  --data-file=- --project=$PROJECT_ID

# Donner accès à Cloud Build au Secret Manager
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding db-password \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=$PROJECT_ID

# Configurer l'authentification Docker vers Artifact Registry
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Déclencher le premier build
gcloud builds submit --config=cloudbuild.yaml --project=$PROJECT_ID
```

### Étape 8 — Connecter Cloud Build au dépôt GitHub (CI/CD automatique)

```bash
# Dans la console GCP → Cloud Build → Triggers → Connect Repository
# Ou via CLI :
gcloud builds triggers create github \
  --repo-name=Botfactory \
  --repo-owner=Marin-dev \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.yaml \
  --project=$PROJECT_ID
```

## Checklist de validation

Après déploiement, vérifier :

- [ ] `gcloud run services list --region=$REGION` : 3 services visibles
- [ ] `curl https://svc-tournee-XXXX.a.run.app/actuator/health` → `{"status":"UP"}`
- [ ] `curl https://svc-supervision-XXXX.a.run.app/actuator/health` → `{"status":"UP"}`
- [ ] Frontend supervision accessible via son URL Cloud Run
- [ ] Logs sans erreur : `gcloud logging read "resource.type=cloud_run_revision" --limit=50`

## Dépendance Cloud SQL (driver Spring Boot)

Ajouter dans `pom.xml` de chaque service backend :

```xml
<dependency>
  <groupId>com.google.cloud.sql</groupId>
  <artifactId>postgres-socket-factory</artifactId>
  <version>1.15.0</version>
</dependency>
```

## Points d'attention

- **Sécurité** : ne jamais mettre de mots de passe dans le `cloudbuild.yaml` — toujours via Secret Manager.
- **Cold start** : Spring Boot démarre en ~30s, configurer `--min-instances=1` si les cold starts posent problème.
- **CORS** : mettre à jour les origines autorisées dans les backends avec les URLs Cloud Run réelles.
- **Expo mobile** : l'app mobile Expo peut être déployée en tant que web app via Cloud Run, ou distribuée via Expo Go / EAS pour les tests mobiles natifs.
- **Base de données partagée** : en recette, `svc-tournee` et `svc-supervision` peuvent partager la même instance Cloud SQL (deux bases distinctes ou schémas distincts).

## Livrable associé

Mettre à jour `/livrables/08-devops/pipeline-cicd.md` avec les décisions prises
et documenter les URLs de recette dans `/livrables/00-contexte/infrastructure-locale.md`
(section "Environnement recette GCP").
