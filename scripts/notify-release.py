#!/usr/bin/env python3
"""Optional hosted notification. No household access and no artifact execution."""
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.request


def request(path, token, body=None):
    headers = {'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token,
               'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'accepted-release-notifier'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    payload = None if body is None else json.dumps(body).encode()
    for attempt in range(4):
        try:
            req = urllib.request.Request('https://api.github.com/' + path, data=payload, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = response.read(8 * 1024 * 1024)
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            if attempt == 3 or error.code not in {429, 500, 502, 503, 504}:
                raise RuntimeError(f'GitHub notification API returned HTTP {error.code}') from None
        except (urllib.error.URLError, TimeoutError):
            if attempt == 3:
                raise RuntimeError('GitHub notification transport failed') from None
        time.sleep((1, 3, 9)[attempt])


def accepted_run(event, repository):
    run = event.get('workflow_run', {})
    if (run.get('conclusion') != 'success' or run.get('head_branch') != 'main' or
            run.get('event') not in {'push', 'workflow_dispatch', 'schedule'} or
            run.get('head_repository', {}).get('full_name') != repository or
            not re.fullmatch(r'[0-9a-f]{40}', run.get('head_sha', ''))):
        raise ValueError('Notification requires a successful trusted main publication workflow')
    return run['head_sha']


def target(config):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', config['repository']):
        raise ValueError('Invalid destination repository')
    if not re.fullmatch(r'[A-Za-z0-9_-]+\.ya?ml', config['workflow']):
        raise ValueError('Invalid destination workflow')
    inputs = config.get('inputs', {})
    if set(inputs) - {'service', 'operation'}:
        raise ValueError('Unexpected dispatch input')
    if inputs and (not re.fullmatch(r'[a-z][a-z0-9-]{0,39}', inputs.get('service', '')) or inputs.get('operation') != 'reconcile'):
        raise ValueError('Notifications may request reconciliation only')
    return f'repos/{config["repository"]}/actions/workflows/{config["workflow"]}/dispatches', {'ref': 'main', 'inputs': inputs}


def main():
    if os.environ.get('GITHUB_EVENT_NAME') != 'workflow_run':
        raise ValueError('This notifier only consumes workflow_run events')
    if os.environ.get('RELEASE_NOTIFY_ENABLED') != 'true':
        print('Release notification disabled.')
        return
    repo = os.environ['GITHUB_REPOSITORY']
    sha = accepted_run(json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text()), repo)
    token = os.environ.get('DOWNSTREAM_DISPATCH_TOKEN')
    if not token:
        raise ValueError('DOWNSTREAM_DISPATCH_TOKEN with destination Actions write is missing')
    releases = request(f'repos/{repo}/releases?per_page=100', os.environ['GH_TOKEN'])
    pattern = re.compile(r'build-' + sha + r'(?:-[0-9a-f]{12})?')
    eligible = [r for r in releases if pattern.fullmatch(r.get('tag_name', '')) and
                r.get('immutable') is True and not r.get('draft') and not r.get('prerelease')]
    if not eligible:
        raise ValueError('Successful workflow has no published immutable release; nothing notified')
    config = json.loads(Path('.github/downstream.json').read_text())
    path, body = target(config)
    request(path, token, body)
    print('Accepted immutable release notified downstream. Destination independently resolves and verifies it.')


if __name__ == '__main__':
    main()
