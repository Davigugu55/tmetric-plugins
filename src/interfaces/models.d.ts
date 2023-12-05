declare module Models {

    export const enum Limits {
        maxClientName = 255,
        maxIntegrationUrl = 512,
        maxTaskRelativeUrl = 256,
        maxIssueId = 128,
        maxIntegrationAccessKey = 255,
        maxIntegrationType = 128,
        maxUserName = 255,
        maxEmail = 128,
        maxProjectName = 255,
        maxProjectCode = 16,
        maxAccountName = 128,
        maxTag = 50,
        maxTeamName = 255,
        maxTask = 400
    }

    export const enum ReportTimeRoundingMode {
        None,
        Floor,
        Round,
        Ceil
    }

    export const enum ShowPopupOption {
        Always,
        WhenProjectIsNotSpecified,
        Never
    }

    interface Constants {
        maxTimerHours: number;
        extensionName: string;
        browserSchema: string;
        extensionUUID: string;
        serviceUrl: string;
        storageUrl: string;
        authorityUrl: string;
    }

    interface TimeZoneInfo {
        id: string;
        displayName: string;
    }

    interface UserProfile {
        userProfileId: number;
        activeAccountId: number;
        userName: string;
        dateFormat: string;

        /*
         * Time format for specific user.
         * 'H:mm' - 24h format.
         * 'h:mm a' - 12h format.
         */
        timeFormat: string;
        firstWeekDay: number;
        showBreaks: boolean;
        email: string;
        timeZoneInfo: Models.TimeZoneInfo;

        /*
         * This collection defines which service accounts the user can access.
         * Accounts where user is locked are not included in the list.
         */
        accountMembership: {
            accountMemberId: number,
            account: Models.Account,
            role: Models.ServiceRole,
            defaultWorkTypeId?: number
        }[];

        isRegistered: boolean;
    }

    interface Account {
        accountId: number;
        accountName: string;
        reportTimeFormat: string;
        reportTimeRoundingMode: ReportTimeRoundingMode;
        reportTimeRoundingMinutes: number;
        editableDays: number;
        firstWeekDay: number;
        reportDetailedTimeEnabled: boolean;
        canMembersManagePublicProjects: boolean;
        canMembersCreateTags: boolean;
    }

    export interface RequiredFields {
        description: boolean;
        project: boolean;
        tags: boolean;
        taskLink: boolean;
    }

    interface AccountMember {
        accountId: number;
        accountMemberId: number;
        account: Models.Account;
        role: ServiceRole;
        defaultWorkTypeId: number;
        isLocked: boolean;
        userProfile: Models.UserProfile;
    }

    interface IntegratedProjectIdentifier {
        serviceUrl: string;
        serviceType: string;
        projectName: string;
        showIssueId: boolean;
    }

    const enum ProjectRole {
        Member,
        Manager
    }

    const enum ProjectStatus {
        Open = 1,
        Closed = 2,
        Archived = 3
    }

    const enum ServiceRole {
        Member = 0,
        Client = 1,
        Admin = 2,
        Owner = 3
    }

    interface IntegratedProjectStatus {
        accountId: number;
        integrationType: string;
        projectStatus: ProjectStatus;
        projectRole: ProjectRole;
        serviceRole: ServiceRole;
        canAddProject: boolean;
    }

    export class ProjectTask {
        assigneeId: number;
        budgetSize: number;
        created: string;
        creatorId: number;
        description: string;
        externalIssueId: string;
        showIssueId: boolean;
        integrationId: number;
        integrationUrl: string;
        isBillable: boolean;
        isCompleted: boolean;
        projectTaskId: number;
        projectId: number;
        relativeIssueUrl: string;
        tagsIdentifiers: number[];
    }

    interface TimeEntryDetail {
        description: string;
        projectId: number;
        projectTask: ProjectTask;
    }

    interface Timer {
        isStarted: boolean;
        details: TimeEntryDetail;
        startTime: string;
        tagsIdentifiers: number[];
        isBillable: boolean;
    }

    interface TimerEx extends Timer {
        projectName?: string;
    }

    interface TimeEntry {
        details: TimeEntryDetail;
        startTime: string;
        endTime?: string;
        projectName: string;
        tagsIdentifiers?: number[];
    }

    interface ProjectLite {
        projectId: number;
        projectName: string;
        projectCode: string;
        accountId: number;
        avatar: string;
        clientId: number;
        isBillable: boolean;
        projectStatus: ProjectStatus;
        budgetSize: number;
        budgetAlertPercents: number;
        notes: string;
        workTypeIdentifires: number[];
        memberCount: number;
        groupCount: number;
    }

    interface Tag {
        tagId: number;
        accountId: number;
        tagName: string;
        defaultBillableRate: any;
        isWorkType: boolean;
        workTypeProjects: number[];
    }

    interface Client {
        clientId: number;
        accountId: number;
        clientName: string;
        avatar: string;
        activeProjectsCount: number;
        totalProjectsCount: number;
        defaultBillableRate: Money;
        contactMembers: number[];
    }

    interface RecentWorkTask {
        details: TimeEntryDetail;
        tagsIdentifiers: number[];
        isBillable: boolean;
    }

    interface AccountScope {
        members: AccountMember[];
        groups: any[];
        projects: ProjectLite[];
        clients: Client[];
        tags: Tag[];
        managedProjects: number[];
        trackedProjects: number[];
        managedGroups: any[];
        managedUsers: any[];
        account: Account;
        features: any;
        requiredFields: RequiredFields;
    }

    interface Money {
        amount: number;
        currency: string;
    }

    interface IntegrationInfo {

        serviceType: string;

        serviceUrl: string;

    }
}