// GitHub Integration for Replit Connection
import { Octokit } from '@octokit/rest';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

export async function createGitHubRepository(repoName: string, description: string, isPrivate: boolean = false) {
  const octokit = await getUncachableGitHubClient();
  
  try {
    const { data } = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      description: description,
      private: isPrivate,
      auto_init: false
    });
    
    return {
      success: true,
      repoUrl: data.html_url,
      cloneUrl: data.clone_url,
      sshUrl: data.ssh_url
    };
  } catch (error: any) {
    if (error.status === 422) {
      // Repository already exists, get its info
      const user = await octokit.users.getAuthenticated();
      return {
        success: true,
        repoUrl: `https://github.com/${user.data.login}/${repoName}`,
        exists: true
      };
    }
    throw error;
  }
}

export async function getAuthenticatedUser() {
  const octokit = await getUncachableGitHubClient();
  const { data } = await octokit.users.getAuthenticated();
  return data;
}
