﻿class IntegrationService {

    static session = Date.now();

    static affix = 'devart-timer-link';

    static register(...integrations: WebToolIntegration[]) {
        this._allIntegrations.push(...integrations);
    }

    static onIssueLinksUpdated: () => void;

    static isUrlMatched(integration: WebToolIntegration, url: string) {
        function convertPatternToRegExp(matchPattern: string) {
            let regexp = IntegrationService._matchPatternCache[matchPattern];
            if (!regexp) {
                regexp = new RegExp(matchPattern
                    .replace(/[\-\/\\\^\$\+\?\.\(\)\|\[\]\{\}]/g, '\\$&')
                    .replace(/\*/g, '.*'));
                IntegrationService._matchPatternCache[matchPattern] = regexp;
            }
            return regexp;
        }

        let matchUrl = integration.matchUrl;
        if (!matchUrl) {
            return true;
        }

        let patterns = (matchUrl instanceof Array ? <any[]>matchUrl : [<any>matchUrl]);
        return patterns.some(pattern => {
            let regexp = typeof pattern === 'string' ? convertPatternToRegExp(pattern) : <RegExp>pattern;
            return regexp.test(url);
        });
    }

    static setConstants(constants: Models.Constants) {
        this._constants = constants;
    }

    static setTimer(timer: Models.TimerEx) {
        this._timer = timer;
    }

    static needsUpdate() {
        // Find 'Stop' link or 'Start' link associated with current timer.
        // If it is found we should refresh links on a page.
        return $$.all('a.' + this.affix).some(link => {
            let linkTimer = this.parseLinkTimer(link);
            this.checkTimerExternalTask(linkTimer);
            return !linkTimer.isStarted || this.isIssueStarted(linkTimer);
        });
    }

    static updateLinks(checkAllIntegrations: boolean) {
        let source = this.getSourceInfo(document.URL);

        if (!this._possibleIntegrations || checkAllIntegrations) {
            this._possibleIntegrations = this._allIntegrations;
        }

        this._possibleIntegrations = this._possibleIntegrations.filter(integration =>
            this.isUrlMatched(integration, source.fullUrl) &&
            (!integration.match || integration.match(source)));

        let issues = <WebToolIssue[]>[];
        let parsedIssues = <WebToolParsedIssue[]>[];

        this._possibleIntegrations.some(integration => {

            let elements = [<HTMLElement>null];
            let selector = integration.issueElementSelector;
            if (selector) {
                if (typeof selector === 'function') {
                    elements = (<() => HTMLElement[]>selector)().filter(_ => !!_);
                } else {
                    elements = $$.all(Array.isArray(selector) ? (<string[]><any>selector).join(', ') : selector);
                }
            }

            elements.forEach(element => {
                let issue = integration.getIssue(element, source);
                if (!issue || !issue.issueName && !issue.projectName) {
                    // Remove link when issue can not be parsed after DOM changes
                    this.updateLink(element, null, null, null);
                } else {
                    // normalize urls
                    issue.serviceUrl = issue.serviceUrl ? issue.serviceUrl.replace(/\/+$/, '') : issue.serviceUrl;
                    issue.issueUrl = issue.issueUrl ? issue.issueUrl.replace(/^\/*/, '/') : issue.issueUrl;

                    // trim all string values
                    issue.issueId = this.trimText(issue.issueId, Models.Limits.maxIssueId);
                    issue.issueName = this.trimText(issue.issueName, Models.Limits.maxTask);
                    issue.issueUrl = this.trimText(issue.issueUrl, Models.Limits.maxTaskRelativeUrl);
                    issue.serviceUrl = this.trimText(issue.serviceUrl, Models.Limits.maxIntegrationUrl);
                    issue.serviceType = this.trimText(issue.serviceType, Models.Limits.maxIntegrationType);
                    issue.projectName = this.trimText(issue.projectName, Models.Limits.maxProjectName);

                    // take issueId and issueUrl from started timer if description matches issue name
                    this.checkTimerExternalTask(issue);

                    if (!issue.issueUrl || !issue.serviceUrl || !issue.serviceType) {
                        issue.issueUrl = null;
                        issue.issueId = null;
                        issue.serviceUrl = null;
                        issue.serviceType = null;
                    }

                    if (issue.tagNames) {
                        issue.tagNames = issue.tagNames
                            .map(tagName => this.trimText(tagName, Models.Limits.maxTag))
                            .filter(tagName => !!tagName);
                    }

                    issues.push(issue);
                    parsedIssues.push({ element, issue });
                }
            });

            if (!issues.length) {
                this.onIssueLinksUpdated();
            } else {
                this._possibleIntegrations = [integration];

                // render new links immediately to prevent flickering on task services which observe mutations
                let newParsedIssues = parsedIssues.filter(issue => !$$('a.' + this.affix, issue.element));
                IntegrationService.updateIssues(integration, newParsedIssues);
                this.onIssueLinksUpdated();

                // render links with actual durations later
                this.getIssuesDurations(issues).then(durations => {
                    IntegrationService._issueDurationsCache = durations;
                    IntegrationService.updateIssues(integration, parsedIssues);
                    this.onIssueLinksUpdated();
                }).catch(() => {
                    console.log('getIssuesDurations rejected');
                });

                return true;
            }
        });

        return { issues, observeMutations: this._possibleIntegrations.some(i => i.observeMutations) };
    }

    static updateIssues(integration: WebToolIntegration, issues: WebToolParsedIssue[]) {

        const MIN = 60 * 1000;
        const HOUR = 60 * MIN;

        issues.forEach(({ element, issue }) => {

            let duration = this.getIssueDuration(issue) || 0;

            if (issue.issueUrl && this.isIssueStarted(issue)) {
                // Show zero duration if client clock is late (TMET-947)
                let timerDuration = Math.max(0, Date.now() - Date.parse(this._timer.startTime));
                if (timerDuration <= this._constants.maxTimerHours * HOUR) {
                    // Add current timer duration if timer is not long running
                    duration += timerDuration;
                }
            }

            duration = Math.floor(duration / MIN) * MIN;
            this.updateLink(element, integration, issue, duration);
        });
    }

    private static _issueDurationsCache: WebToolIssueDuration[] = [];

    private static _pendingIssuesDurations = <{
        identifiers: WebToolIssueIdentifier[],
        resolve: (data: WebToolIssueDuration[]) => void,
        reject: (reason?: any) => void
    }>null;

    static setIssuesDurations(durations) {
        if (this._pendingIssuesDurations) {
            let resolve = this._pendingIssuesDurations.resolve;
            this._pendingIssuesDurations = null;
            resolve(durations);
        }
    }

    private static makeIssueDurationKey(identifier: WebToolIssueIdentifier) {
        return identifier.serviceUrl + '/' + identifier.issueUrl;
    }

    static getIssuesDurations(identifiers: WebToolIssueIdentifier[]): Promise<WebToolIssueDuration[]> {

        if (!identifiers || !identifiers.length) {

            // Rerturn empty result
            return Promise.resolve([]);
        }

        let newIdentifiers: WebToolIssueIdentifier[] = [];
        let oldIdentifiers: { [name: string]: boolean } = {};

        let pendingDurations = this._pendingIssuesDurations;

        if (pendingDurations) {

            pendingDurations.identifiers.forEach(id => oldIdentifiers[this.makeIssueDurationKey(id)] = true);

            // Reject previous promise
            pendingDurations.reject();
        } else {
            pendingDurations = <typeof pendingDurations>{
                identifiers: []
            };
        }

        // Find new identifiers
        identifiers.forEach(id => {
            if (!oldIdentifiers[this.makeIssueDurationKey(id)]) {
                newIdentifiers.push(id);
            }
        });

        // Do not change pending identifiers when they are superset of new ones.
        if (newIdentifiers.length) {
            identifiers = pendingDurations.identifiers.concat(newIdentifiers);
            pendingDurations.identifiers = identifiers;
        }

        // Create new promise
        let promise = new Promise<WebToolIssueDuration[]>((resolve, reject) => {
            pendingDurations.resolve = resolve;
            pendingDurations.reject = reject;
        });

        // Skip duplicated requests (TE-256, TE-277)
        if (newIdentifiers.length) {
            sendBackgroundMessage({ action: 'getIssuesDurations', data: identifiers });
        }

        this._pendingIssuesDurations = pendingDurations;
        return promise;
    }

    static getIssueDuration(issue: WebToolIssueIdentifier) {
        for (let duration of IntegrationService._issueDurationsCache) {
            if (duration.issueUrl == issue.issueUrl && duration.serviceUrl == issue.serviceUrl) {
                return duration.duration;
            }
        }
    }

    private static trimText(text: string, maxLength: number) {
        if (text) {
            // Remove zero-width spaces and trim
            text = text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
            if (text.length > maxLength) {
                text = text.substring(0, maxLength - 2) + '..';
            }
        }
        return text || null;
    }

    private static durationToString(duration: number) {

        let sign = '';
        if (duration < 0) {
            duration = -duration;
            sign = '-';
        }

        let totalMinutes = Math.floor(duration / 60000);
        let hours = Math.floor(totalMinutes / 60);
        let minutes = totalMinutes % 60;

        return sign + hours + (minutes < 10 ? ':0' : ':') + minutes;
    }

    private static parseLinkTimer(link: HTMLElement) {
        if (link) {
            return <WebToolIssueTimer & WebToolIssueDuration>JSON.parse(link.getAttribute('data-' + this.affix));
        }
    }

    private static parseLinkSession(link: HTMLElement) {
        if (link) {
            return parseInt(link.getAttribute('data-session'));
        }
    }

    static updateLink(element: HTMLElement, integration: WebToolIntegration, newIssue: WebToolIssue, newIssueDuration: number) {

        let oldLink = $$('a.' + this.affix, element);

        if (!newIssue) {
            this.removeLink(oldLink);
            return;
        }

        let isIssueStarted = this.isIssueStarted(newIssue);

        let newIssueTimer = <WebToolIssueTimer & WebToolIssueDuration>{};
        newIssueTimer.isStarted = !isIssueStarted;
        newIssueTimer.showIssueId = integration.showIssueId;
        newIssueTimer.duration = newIssueDuration;

        for (let i in newIssue) {
            newIssueTimer[i] = newIssue[i];
        }

        let oldIssueTimer: WebToolIssueTimer & WebToolIssueDuration;
        let oldSession: number;
        if (oldLink) {
            oldIssueTimer = this.parseLinkTimer(oldLink);
            oldSession = this.parseLinkSession(oldLink);
        }

        if (this.isSameIssue(oldIssueTimer, newIssueTimer) &&
            newIssueTimer.duration == oldIssueTimer.duration &&
            newIssueTimer.isStarted == oldIssueTimer.isStarted &&
            newIssueTimer.projectName == oldIssueTimer.projectName &&
            this.areSetsEqual(newIssueTimer.tagNames, oldIssueTimer.tagNames) &&
            oldSession == this.session
        ) {
            // Issue is not changed and belong to same session (#67711)
            return;
        }

        this.removeLink(oldLink);

        // Create new timer link
        let newLink = document.createElement('a');
        newLink.classList.add(this.affix);
        newLink.classList.add(this.affix + (isIssueStarted ? '-stop' : '-start'));
        newLink.setAttribute('data-' + this.affix, JSON.stringify(newIssueTimer));
        newLink.setAttribute('data-session', this.session.toString());
        newLink.href = '#';
        newLink.title = 'Track spent time via TMetric service';
        newLink.onclick = function (this: HTMLAnchorElement, e) {
            // TE-342 - prevent keeping focus on timer button
            this.blur();
            e.stopPropagation();
            sendBackgroundMessage({ action: 'putTimer', data: newIssueTimer });
            return false;
        };
        let spanWithIcon = document.createElement('span');
        spanWithIcon.classList.add(this.affix + '-icon');
        newLink.appendChild(spanWithIcon);
        let span = document.createElement('span');
        span.textContent = isIssueStarted ? 'Stop timer' : 'Start timer';
        if (newIssue.issueUrl && (newIssueTimer.duration || isIssueStarted)) {
            span.textContent += ' (' + this.durationToString(newIssueTimer.duration) + ')';
        }
        newLink.appendChild(span);

        integration.render(element, newLink);
    }

    static clearPage() {
        $$.all('a.' + this.affix).forEach(a => this.removeLink(a));
    }

    private static checkTimerExternalTask(issue: WebToolIssue) {
        if (!issue.issueUrl
            && this._timer
            && this._timer.isStarted) {

            let projectTask = this._timer.details && this._timer.details.projectTask;
            if (projectTask
                && projectTask.relativeIssueUrl
                && projectTask.description == issue.issueName) {

                issue.serviceUrl = projectTask.integrationUrl;
                issue.issueUrl = projectTask.relativeIssueUrl;
                issue.issueId = projectTask.externalIssueId;
            }
        }
    }

    private static isSameIssue(oldIssue: WebToolIssue, newIssue: WebToolIssue) {

        function normalizeServiceUrl(issue: WebToolIssue) {
            let url = (issue.serviceUrl || '').trim();
            if (url.length && url[url.length - 1] == '/') {
                return url.substring(0, url.length - 1);
            }
            return url;
        }

        function normalize(text: string) {
            return (text || '').trim();
        }

        if (oldIssue === newIssue) {
            return true;
        }

        return oldIssue &&
            oldIssue.issueId == newIssue.issueId &&
            normalize(oldIssue.issueName) == normalize(newIssue.issueName) &&
            (oldIssue.issueName || oldIssue.projectName == newIssue.projectName) &&
            normalize(oldIssue.description) == normalize(newIssue.description) &&
            normalizeServiceUrl(oldIssue) == normalizeServiceUrl(newIssue);
    }

    private static _allIntegrations = <WebToolIntegration[]>[];

    private static _possibleIntegrations: WebToolIntegration[];

    private static _constants: Models.Constants;

    private static _timer: Models.TimerEx;

    private static _matchPatternCache: { [pattern: string]: RegExp } = {};

    private static getSourceInfo(fullUrl: string): Source {

        let host = fullUrl || '';

        let protocol = '';
        let path = '';

        let i = host.search(/[#\?]/);
        if (i >= 0) {
            host = host.substring(0, i);
        }

        i = host.indexOf(':');
        if (i >= 0) {
            i++;
            while (i < host.length && host[i] == '/') {
                i++;
            }
            protocol = host.substring(0, i);
            host = host.substring(i);
        }

        i = host.indexOf('/');
        if (i >= 0) {
            path = host.substring(i);
            host = host.substring(0, i);
        }

        return { fullUrl, protocol, host, path };
    }

    private static areSetsEqual<T>(set1: T[], set2: T[]) {
        set1 = set1 || [];
        set2 = set2 || [];
        if (set1.length != set2.length) {
            return false;
        }
        let hasValue: { [key: string]: boolean } = {};
        set1.forEach(item => hasValue[item && item.toString()] = true);
        return set2.every(item => hasValue[item && item.toString()]);
    }

    private static removeLink(link: HTMLElement) {
        if (!link) {
            return;
        }
        let content = link;
        let container = link.parentElement;

        while (container && container.classList
            && container.classList.contains(this.affix + '-' + container.tagName.toLowerCase())) {
            content = container;
            container = container.parentElement;
        }

        if (container) {
            container.removeChild(content);
        }
    }

    private static isIssueStarted(issue: WebToolIssue) {

        let timer = this._timer;
        if (!timer || !timer.isStarted || !timer.details) {
            return false;
        }

        let startedIssue: WebToolIssue;

        let task = timer.details.projectTask;
        if (task) {
            startedIssue = {
                issueId: task.externalIssueId,
                issueName: task.description,
                issueUrl: task.relativeIssueUrl,
                serviceUrl: task.integrationUrl
            };
        } else {
            startedIssue = {
                issueName: timer.details.description
            }
        }

        // TE-211 - compare issue project with timer project
        startedIssue.projectName = timer.projectName

        // Check description only in subtasks
        if (issue.description) {
            startedIssue.description = timer.details.description;
        }

        return this.isSameIssue(startedIssue, issue);
    }
}