// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { MemoryRouter } from "react-router-dom";
import TeamPage from "./TeamPage";
import apiClient from "../lib/apiClient";
import { useAuth } from "../lib/auth";
import { useSimStore } from "../store/useSimStore";

vi.mock("../lib/auth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../store/useSimStore", () => ({
  useSimStore: vi.fn(),
}));

vi.mock("../lib/apiClient", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  isAxiosError: (error: unknown) =>
    Boolean(error && typeof error === "object" && (error as { isAxiosError?: boolean }).isAxiosError),
}));

type TeamRole = "viewer" | "engineer" | "team_admin";

type TeamMember = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: TeamRole;
  created_at: string;
  updated_at: string;
};

type TeamProject = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type TeamInvite = {
  id: number;
  email: string;
  role: TeamRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  invite_url: string;
  expires_at: string;
  last_sent_at: string | null;
  send_count: number;
  delivery_error: string;
  created_at: string;
  updated_at: string;
  invited_by_name: string | null;
};

type TeamDetail = {
  id: number;
  name: string;
  role: TeamRole | null;
  member_count: number;
  project_count: number;
  members: TeamMember[];
  projects: TeamProject[];
  invites: TeamInvite[];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("TeamPage", () => {
  const mockedApiClient = apiClient as unknown as {
    get: Mock;
    post: Mock;
    patch: Mock;
  };
  const mockedUseAuth = useAuth as unknown as Mock;
  const mockedUseSimStore = useSimStore as unknown as Mock;

  const baseMember: TeamMember = {
    id: 10,
    username: "captain",
    email: "captain@example.com",
    first_name: "Captain",
    last_name: "Nereus",
    role: "team_admin",
    created_at: "2026-05-01T10:00:00Z",
    updated_at: "2026-05-01T10:00:00Z",
  };

  let setProjectId: Mock;
  let refreshUser: Mock;
  let teamState: TeamDetail;

  beforeEach(() => {
    setProjectId = vi.fn();
    refreshUser = vi.fn().mockResolvedValue({
      id: 10,
      username: "captain",
      email: "captain@example.com",
      first_name: "Captain",
      last_name: "Nereus",
      is_superuser: false,
      teams: [
        {
          id: 1,
          name: "Hull Lab",
          role: "team_admin",
          member_count: 1,
          project_count: 0,
        },
      ],
    });

    teamState = {
      id: 1,
      name: "Hull Lab",
      role: "team_admin",
      member_count: 1,
      project_count: 0,
      members: [baseMember],
      projects: [],
      invites: [],
    };

    mockedUseAuth.mockReturnValue({
      user: {
        id: 10,
        username: "captain",
        email: "captain@example.com",
        first_name: "Captain",
        last_name: "Nereus",
        is_superuser: false,
        teams: [
          {
            id: 1,
            name: "Hull Lab",
            role: "team_admin",
            member_count: 1,
            project_count: 0,
          },
        ],
      },
      isLoading: false,
      isAuthenticated: true,
      activeTeamId: 1,
      activeTeam: {
        id: 1,
        name: "Hull Lab",
        role: "team_admin",
        member_count: 1,
        project_count: 0,
      },
      setActiveTeamId: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser,
    });

    mockedUseSimStore.mockImplementation((selector: (state: { setProjectId: Mock }) => unknown) =>
      selector({ setProjectId }),
    );

    mockedApiClient.get.mockImplementation(async (url: string) => {
      if (url === "/api/teams/1/") {
        return { data: clone(teamState) };
      }

      throw new Error(`Unhandled GET ${url}`);
    });

    mockedApiClient.post.mockImplementation(async (url: string, payload?: Record<string, unknown>) => {
      if (url === "/api/projects/") {
        const createdProject: TeamProject = {
          id: 501,
          name: String(payload?.name ?? ""),
          description: typeof payload?.description === "string" ? payload.description : null,
          created_at: "2026-05-03T08:10:00Z",
          updated_at: "2026-05-03T08:10:00Z",
        };
        teamState = {
          ...teamState,
          project_count: teamState.project_count + 1,
          projects: [createdProject, ...teamState.projects],
        };
        return { data: { id: createdProject.id, name: createdProject.name } };
      }

      if (url === "/api/teams/1/invites/") {
        const invite: TeamInvite = {
          id: 77,
          email: String(payload?.email ?? ""),
          role: String(payload?.role ?? "viewer") as TeamRole,
          status: "pending",
          invite_url: "http://localhost:5173/join/token-1",
          expires_at: "2026-05-17T08:10:00Z",
          last_sent_at: "2026-05-03T08:10:00Z",
          send_count: 1,
          delivery_error: "",
          created_at: "2026-05-03T08:10:00Z",
          updated_at: "2026-05-03T08:10:00Z",
          invited_by_name: "Captain Nereus",
        };
        teamState = {
          ...teamState,
          invites: [invite, ...teamState.invites],
        };
        return { data: clone(invite) };
      }

      if (url === "/api/teams/1/invites/77/resend/") {
        teamState = {
          ...teamState,
          invites: teamState.invites.map((invite) =>
            invite.id === 77
              ? {
                  ...invite,
                  invite_url: "http://localhost:5173/join/token-2",
                  last_sent_at: "2026-05-03T09:00:00Z",
                  send_count: invite.send_count + 1,
                  updated_at: "2026-05-03T09:00:00Z",
                }
              : invite,
          ),
        };
        return { data: clone(teamState.invites[0]) };
      }

      throw new Error(`Unhandled POST ${url}`);
    });

    mockedApiClient.patch.mockImplementation(async (url: string, payload?: Record<string, unknown>) => {
      if (url === "/api/teams/1/") {
        teamState = {
          ...teamState,
          name: String(payload?.name ?? teamState.name),
        };
        return { data: clone(teamState) };
      }

      throw new Error(`Unhandled PATCH ${url}`);
    });
  });

  it("lets a team admin create a project, manage invites, and rename the workspace", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <TeamPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Hull Lab" })).toBeTruthy();

    await user.type(screen.getByPlaceholderText("Project name"), "Foil Alpha");
    await user.type(screen.getByPlaceholderText("Project description"), "Fast trim study");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByText("Created project Foil Alpha.")).toBeTruthy();
    expect(screen.getAllByText("Foil Alpha").length).toBeGreaterThan(0);
    expect(setProjectId).toHaveBeenCalledWith(501);
    expect(mockedApiClient.post).toHaveBeenCalledWith("/api/projects/", {
      name: "Foil Alpha",
      description: "Fast trim study",
      team: 1,
    });

    await user.click(screen.getByRole("button", { name: /invites/i }));
    await user.type(screen.getByPlaceholderText("engineer@company.com"), "new.engineer@example.com");
    await user.selectOptions(screen.getByRole("combobox"), "engineer");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    expect(await screen.findByText("Invite sent to new.engineer@example.com.")).toBeTruthy();
    expect(screen.getByText("new.engineer@example.com")).toBeTruthy();
    expect(mockedApiClient.post).toHaveBeenCalledWith("/api/teams/1/invites/", {
      email: "new.engineer@example.com",
      role: "engineer",
    });

    await user.click(screen.getByRole("button", { name: /resend/i }));

    expect(await screen.findByText("Invite resent to new.engineer@example.com.")).toBeTruthy();
    expect(mockedApiClient.post).toHaveBeenCalledWith("/api/teams/1/invites/77/resend/");

    await user.click(screen.getByRole("button", { name: /settings/i }));
    const teamNameInput = screen.getByLabelText("Team name");
    await user.clear(teamNameInput);
    await user.type(teamNameInput, "Hull Lab Prime");
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    expect(await screen.findByText("Team settings updated.")).toBeTruthy();
    expect(mockedApiClient.patch).toHaveBeenCalledWith("/api/teams/1/", {
      name: "Hull Lab Prime",
    });
    expect(refreshUser).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /overview/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Hull Lab Prime" })).toBeTruthy();
    });
  });
});