// 휴대폰과 별도로 빌드하는 Wear OS 애플리케이션입니다.
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = "FORMWear"
include(":app")
