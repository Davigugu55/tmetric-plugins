﻿class TfsIntegration implements WebToolIntegration {

    showIssueId = true;

    observeMutations = true;

    matchUrl = [
        // Visual Studio Team Services
        '*://*.visualstudio.com/*',
        // Azure DevOps / Team Foundation Server
        '*://*/_home*',
        '*://*/_boards*',
        '*://*/_dashboards*',
        '*://*/_backlogs*',
        '*://*/_workitems*'
    ];

    issueElementSelector = () => $$.all('.work-item-form');

    render(issueElement: HTMLElement, linkElement: HTMLElement) {

        let host = $$.visible('.work-item-form-headerContent', issueElement);
        if (!host) {
            return;
        }

        let linkContainer = $$.create('div', 'devart-timer-link-tfs');
        linkContainer.appendChild(linkElement);
        host.insertBefore(linkContainer, host.firstElementChild);
    }

    getIssue(issueElement: HTMLElement, source: Source): WebToolIssue {

        let issue = (<HTMLInputElement>$$.visible('.work-item-form-title input', issueElement));
        let issueName = issue && issue.value;

        if (!issueName) {
            // nothing to do without issue name
            return;
        }

        let issueId: string;
        let issueUrl: string;

        // find the nearest info-text-wrapper anchor
        let parent = issueElement;
        while (parent) {
            let issueUrlElement = $$('.info-text-wrapper a', parent);
            if (issueUrlElement) {
                issueUrl = issueUrlElement.getAttribute('href');
                break;
            }
            parent = parent.parentElement;
        }

        if (issueUrl) {
            // /ProjectName/_workitems/edit/1
            // /ProjectName/_workitems/edit/1?fullScreen=false
            let issueIdRegExp = /\/edit\/(\d*)(\?.*)?$/.exec(issueUrl);
            if (issueIdRegExp) {
                issueId = '#' + issueIdRegExp[1];
            }
            else {
                issueUrl = null;
            }
        }

        let tagNames = $$.all("span.tag-box.tag-box-delete-experience", issueElement).map(label => label.textContent);

        // https://devart.visualstudio.com/
        let serviceUrl = source.protocol + source.host;
        let serviceType = 'TFS';

        let itemView = $$.visible('.work-item-view', issueElement);
        let projectInput = itemView && $$('input[aria-label="Area Path"]', itemView) // new layout
            || $$('.work-item-form-areaIteration input', issueElement) // old layout
        let projectName = projectInput && (<HTMLInputElement>projectInput).value;

        return { issueId, issueName, projectName, serviceType, serviceUrl, issueUrl, tagNames };
    }
}

IntegrationService.register(new TfsIntegration());