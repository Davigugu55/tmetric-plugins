class Jira implements WebToolIntegration {

    showIssueId = true;

    issueLinkSelector = 'a[href^="/browse/"][target=_blank]';

    match(source: Source): boolean {
        return $$.getAttribute('meta[name=application-name]', 'content') == 'JIRA';
    }

    issueElementSelector = () => {

        // Issues and filters page
        let element = $$('#jira-issue-header');
        if (element) {
            element = element.parentElement;
        } else {
            element = $$('#jira-frontend object'); // Old view
            if (element) {
                element = element.parentElement.parentElement.parentElement;
            }
        }

        return [
            $$.visible([
                '#ghx-detail-view', // Issue sidebar
                '[role=dialog]', // Issue dialog
                '#issue-content', // Old issues and filters
                '.new-issue-container' // Issue
            ].join(',')),
            // Issues and filters
            element
        ]
    };

    render(issueElement: HTMLElement, linkElement: HTMLElement) {

        // Old filters and issues
        let host = $$('.command-bar .aui-toolbar2-primary', issueElement);
        if (host) {
            linkElement.classList.add('aui-button');
            host.appendChild(linkElement);
            return;
        }

        // Old separate issue page
        host = $$('.command-bar .toolbar-split-left', issueElement);
        if (host) {
            const ul = $$.create('ul', 'toolbar-group');
            const li = $$.create('li', 'toolbar-item');
            linkElement.classList.add('toolbar-trigger');
            li.appendChild(linkElement);
            ul.appendChild(li);
            host.appendChild(ul);
            return;
        }

        // Old agile sidebar
        host = $$('#ghx-detail-head', issueElement);
        if (host) {
            const container = $$.create('div');
            container.appendChild(linkElement);
            host.appendChild(container);
            return;
        }

        // New view
        const issueName = $$('h1', issueElement);
        if (!issueName) {
            return;
        }

        const anchor = $$(this.issueLinkSelector, issueElement);
        if (anchor) {
            linkElement.classList.add('devart-timer-link-jira-next');
            if (issueElement.matches('#ghx-detail-view')) {
                linkElement.classList.add('devart-timer-link-minimal');
            }
            anchor.parentElement.appendChild(linkElement);
            return;
        }
    }

    getIssue(issueElement: HTMLElement, source: Source): WebToolIssue {

        const issueName = $$.try<HTMLInputElement>('#summary').value || $$.try('dd[data-field-id=summary], h1', issueElement).textContent;
        if (!issueName) {
            return;
        }

        // In case when JIRA installed outside domain root we
        // should append path to serviceUrl.
        // Example: https://issues.apache.org/jira/
        const servicePath = $$.getAttribute('meta[name=ajs-context-path]', 'content');
        const serviceUrl = source.protocol + source.host + servicePath;

        let issueId = $$.searchParams(source.fullUrl)['selectedIssue'] // Board
            || (source.path.match(/\/(?:issues|browse)\/([^\/]+)/) || [])[1]; // Other pages

        issueId = issueId && /[^#]*/.exec(issueId)[0]; // trim hash
        let issueUrl = issueId && ('/browse/' + issueId);

        // Support links in JIRA Service Desk (TE-498)
        if (!issueUrl) {
            issueUrl = $$.getAttribute(this.issueLinkSelector, 'href', issueElement);
            if (issueUrl) {
                issueId = issueUrl.match(/\/browse\/(.*)/)[1];
            }
        }

        const projectName = $$.try('.ghx-project', issueElement).textContent // side panel in backlog (TMET-8077)
            || $$.try('#breadcrumbs-container a', null, el => el.getAttribute('href').split('/').some(v => v == 'projects')).textContent // when navigation bar collapsed
            || $$.try('#project-name-val').textContent // separate task view (/browse/... URL)
            || $$.try('.project-title > a').textContent // old service desk and agile board
            || $$.try('.sd-notify-header').textContent // service desk form https://issues.apache.org/jira/servicedesk/agent/all
            || this.getProjectNameFromProjectLink(issueElement, issueId) // trying to find project link
            || this.getProjectNameFromAvatar(issueElement) // trying to find project avatar
            || this.getProjectNameFromNavigationBar(); // trying to find project name on navigation bar

        // find tags and versions inside task element
        const tags = $$.all('a', issueElement);

        // find tags and versions on side panel of separate task view
        const sidePanel = $$.try('#jira-issue-header-actions').parentElement;
        if (sidePanel) {
            tags.push(...$$.all('a', sidePanel));
        }

        let tagNames = tags
            .filter(el => /jql=labels|jql=project.+AND.+fixVersion/.test(el.getAttribute('href'))) // filter tags and versions
            .map(el => el.textContent);

        if (!tagNames.length) {
            tagNames = ($$.try('dd[data-field-id=labels]', issueElement).textContent || '').split(','); // old interface
        }

        return { issueId, issueName, issueUrl, projectName, serviceUrl, serviceType: 'Jira', tagNames };
    }

    private getCommonAncestorLevel(issueElement: HTMLElement, otherElement: HTMLElement) {
        for (let level = 0; issueElement; level++) {
            if (issueElement.contains(otherElement)) {
                return level;
            }
            issueElement = issueElement.parentElement;
        }
        return Number.MAX_SAFE_INTEGER;
    }

    private getProjectNameFromProjectLink(issueElement: HTMLElement, issueId: string) {

        const projectId = (issueId || '').indexOf('-') > 0 && issueId.split('-')[0];
        if (!projectId) {
            return;
        }

        // search for nearest project link (TMET-8562)
        let link: HTMLElement;
        let minAncestorLevel = Infinity;
        $$.all(`a[href="/browse/${projectId}"]`).forEach(x => {
            const level = this.getCommonAncestorLevel(issueElement, x);
            if (level < minAncestorLevel) {
                minAncestorLevel = level;
                link = x;
            }
        });

        // name can be truncated 
        const projectName = link?.textContent;
        if (projectName?.endsWith('...')) { 
            const img = $$('img', link) as HTMLImageElement;
            if (img.alt?.startsWith(projectName.slice(0, -3))) {
                return img.alt; // get name from project icon alt
            }
        }
        return projectName;
    }

    private getProjectNameFromAvatar(issueElement: HTMLElement) {
        return $$.try('img', issueElement, (img: HTMLImageElement) => /projectavatar/.test(img.src)).title;
    }

    private getProjectNameFromNavigationBar() {
        // Find avatar element
        const avatarElement = $$('#navigation-app span[role="img"], [data-test-id="navigation-apps.project-switcher-v2"] span[role="img"]', null, el => (el.style.backgroundImage || '').indexOf('projectavatar') >= 0);

        // Find avatar container
        const avatarContainer = avatarElement && $$.closest('div,span', avatarElement, el => !!el.innerText);

        // Find text node in avatar container
        const projectNode = avatarContainer && $$.try('div,span', avatarContainer, el => el.textContent && !el.childElementCount);
        if (projectNode && projectNode.offsetWidth) {
            return projectNode.textContent;
        }
    }
}

IntegrationService.register(new Jira());
