import * as THREE from "three";
import type { NavigationWaypoint } from "./CosmicNavigation";
import type { OverlayContent } from "./CosmicContentOverlay";

export interface CosmicTourDefinition {
  id: string;
  title: string;
  description: string;
  duration: number;
  waypoints: NavigationWaypoint[];
  narrative?: string[];
}

export interface PlanetData {
  name: string;
  position: THREE.Vector3;
  moons?: Array<{
    name: string;
    position: THREE.Vector3;
    data: any;
  }>;
  data?: any;
}

export class TourDefinitionBuilder {
  private planets: Map<string, PlanetData> = new Map();

  constructor() {
  }

  // Register planet data for tour building
  /**
   * The Skills planet's real skills under their headings, as the universe
   * registered them from the master list - the tours used to carry a typed
   * list with invented percentages, which is the one thing a resume must
   * never do. No levels: the overlay draws a bar only when one is given.
   */
  private skillsByHeading(): Record<string, string[]> {
    const data = this.planets.get("skills")?.data as Record<string, string[]> | undefined;
    return data && typeof data === "object" ? data : {};
  }

  public registerPlanet(id: string, data: PlanetData): void {
    this.planets.set(id, data);
  }

  // Create Career Journey Tour
  public createCareerJourneyTour(): CosmicTourDefinition {
    const waypoints: NavigationWaypoint[] = [];

    // Opening overview
    waypoints.push({
      id: "overview",
      name: "Galaxy Overview",
      target: {
        position: new THREE.Vector3(0, 800, 1200),
        lookAt: new THREE.Vector3(0, 0, 0),
        duration: 3,
        ease: "power3.out",
      },
      content: this.createOverviewContent(),
      narration:
        "Welcome to the cosmic journey through my professional galaxy. Each planet represents a different aspect of my career, with moons showing specific experiences and achievements.",
    });

    // Experience Planet Journey
    const expPlanet = this.planets.get("experience");
    if (expPlanet) {
      waypoints.push({
        id: "experience-approach",
        name: "Experience Sector",
        target: {
          position: new THREE.Vector3(
            expPlanet.position.x + 400,
            expPlanet.position.y + 200,
            expPlanet.position.z + 300,
          ),
          lookAt: expPlanet.position,
          duration: 2.5,
          ease: "power2.inOut",
        },
        content: this.createExperienceContent(),
        narration:
          "Approaching the Experience Planet - a world shaped by years of professional growth, leadership challenges, and technological innovation.",
      });

      // Visit each experience moon (sorted: latest -> oldest by startDate)
      if (expPlanet.moons) {
        const moonsSorted = expPlanet.moons.slice().sort((a, b) => {
          const parse = (s: any) => {
            if (!s || !s.data) return 0;
            const sd = s.data.startDate || "";
            // attempt to parse MM/YYYY or YYYY
            const parts = sd.split("/");
            if (parts.length === 2) {
              const month = parseInt(parts[0], 10) || 1;
              const year = parseInt(parts[1], 10) || 1970;
              return new Date(year, month - 1).getTime();
            }
            const y = parseInt(sd, 10);
            return isNaN(y) ? 0 : new Date(y, 0).getTime();
          };
          return parse(b) - parse(a);
        });

        moonsSorted.forEach((moon, index) => {
          waypoints.push({
            id: `experience-moon-${index}`,
            name: moon.name,
            target: {
              position: new THREE.Vector3(
                moon.position.x + 80,
                moon.position.y + 40,
                moon.position.z + 60,
              ),
              lookAt: moon.position,
              duration: 2,
              ease: "power2.inOut",
            },
            content: this.createMoonContent(moon.data),
            narration: `Exploring ${moon.name} - a significant chapter in the professional journey.`,
          });
        });
      }
    }

    // Skills Planet Journey
    const skillsPlanet = this.planets.get("skills");
    if (skillsPlanet) {
      waypoints.push({
        id: "skills-approach",
        name: "Skills Constellation",
        target: {
          position: new THREE.Vector3(
            skillsPlanet.position.x + 350,
            skillsPlanet.position.y + 150,
            skillsPlanet.position.z + 250,
          ),
          lookAt: skillsPlanet.position,
          duration: 2.5,
          ease: "power2.inOut",
        },
        content: this.createSkillsContent(),
        narration:
          "Entering the Skills Constellation - where technical mastery, creative problem-solving, and continuous learning converge.",
      });
    }

    return {
      id: "career-journey",
      title: "Career Journey Tour",
      description:
        "A comprehensive journey through professional growth and achievements",
      duration: waypoints.length * 7, // Approximate total duration
      waypoints,
    };
  }

  // Create Technical Deep Dive Tour
  public createTechnicalDeepDiveTour(): CosmicTourDefinition {
    const waypoints: NavigationWaypoint[] = [];

    // Technical overview from a different angle
    waypoints.push({
      id: "tech-overview",
      name: "Technical Galaxy Map",
      target: {
        position: new THREE.Vector3(-600, 300, 800),
        lookAt: new THREE.Vector3(0, 0, 0),
        duration: 3,
        ease: "power3.out",
      },
      content: this.createTechnicalOverviewContent(),
      narration:
        "Analyzing the technical architecture of this professional galaxy - where code meets creativity and innovation drives evolution.",
    });

    // Focus on technical aspects of each planet
    const skillsPlanet = this.planets.get("skills");
    if (skillsPlanet) {
      waypoints.push({
        id: "skills-deep-dive",
        name: "Technology Core",
        target: {
          position: new THREE.Vector3(
            skillsPlanet.position.x + 200,
            skillsPlanet.position.y + 100,
            skillsPlanet.position.z + 150,
          ),
          lookAt: skillsPlanet.position,
          duration: 2,
          ease: "power2.inOut",
        },
        content: this.createTechnicalSkillsContent(),
        narration:
          "Diving into the technological core - layers of programming languages, frameworks, and architectural patterns.",
      });

      // Visit technical skill moons
      if (skillsPlanet.moons) {
        const technicalMoons = skillsPlanet.moons.filter(
          (moon) =>
            moon.name.toLowerCase().includes("technical") ||
            moon.name.toLowerCase().includes("programming") ||
            moon.name.toLowerCase().includes("development"),
        );

        technicalMoons.forEach((moon, index) => {
          waypoints.push({
            id: `tech-moon-${index}`,
            name: `${moon.name} Deep Dive`,
            target: {
              position: new THREE.Vector3(
                moon.position.x + 60,
                moon.position.y + 30,
                moon.position.z + 45,
              ),
              lookAt: moon.position,
              duration: 1.5,
              ease: "power2.inOut",
            },
            content: this.createTechnicalMoonContent(moon.data),
            narration: `Analyzing ${moon.name} - examining the code, patterns, and innovations.`,
          });
        });
      }
    }

    return {
      id: "technical-deep-dive",
      title: "Technical Deep Dive",
      description:
        "An in-depth exploration of technical skills and innovations",
      duration: waypoints.length * 6,
      waypoints,
    };
  }

  // Create Leadership Story Tour
  public createLeadershipStoryTour(): CosmicTourDefinition {
    const waypoints: NavigationWaypoint[] = [];

    // Leadership perspective overview
    waypoints.push({
      id: "leadership-overview",
      name: "Command Center View",
      target: {
        position: new THREE.Vector3(0, 600, -800),
        lookAt: new THREE.Vector3(0, 0, 0),
        duration: 3,
        ease: "power3.out",
      },
      content: this.createLeadershipOverviewContent(),
      narration:
        "From the command center perspective - where strategic vision meets tactical execution and team collaboration drives success.",
    });

    // Focus on leadership experiences
    const expPlanet = this.planets.get("experience");
    if (expPlanet && expPlanet.moons) {
      const leadershipMoons = expPlanet.moons.filter(
        (moon) =>
          moon.data?.role?.toLowerCase().includes("lead") ||
          moon.data?.role?.toLowerCase().includes("director") ||
          moon.data?.role?.toLowerCase().includes("manager") ||
          moon.data?.achievements?.some(
            (achievement: string) =>
              achievement.toLowerCase().includes("team") ||
              achievement.toLowerCase().includes("project"),
          ),
      );

      leadershipMoons.forEach((moon, index) => {
        waypoints.push({
          id: `leadership-${index}`,
          name: `Leadership at ${moon.name}`,
          target: {
            position: new THREE.Vector3(
              moon.position.x + 100,
              moon.position.y + 80,
              moon.position.z + 70,
            ),
            lookAt: moon.position,
            duration: 2.5,
            ease: "power2.inOut",
          },
          content: this.createLeadershipMoonContent(moon.data),
          narration: `Examining leadership journey at ${moon.name} - team building, strategic decisions, and transformational outcomes.`,
        });
      });
    }

    return {
      id: "leadership-story",
      title: "Leadership Journey",
      description: "The evolution of leadership skills and team impact",
      duration: waypoints.length * 8,
      waypoints,
    };
  }

  // Content creation helpers
  private createOverviewContent(): OverlayContent {
    return {
      title: "Professional Galaxy Overview",
      subtitle: "A Cosmic Journey Through Career and Skills",
      description:
        "Welcome to an immersive exploration of professional achievements, technical mastery, and creative innovation. Each celestial body represents a different aspect of the career journey.",
      sections: [
        {
          id: "navigation",
          title: "Navigation Guide",
          content: [
            "🌟 Each planet represents a major career category",
            "🌙 Moons orbit planets showing specific experiences or skills",
            "🚀 Use guided tours for curated journeys",
            "🎮 Free navigation mode for personal exploration",
            "📊 Interactive content reveals detailed information",
          ],
          type: "text",
        },
        {
          id: "galaxy-map",
          title: "Galaxy Structure",
          content:
            "This cosmic resume contains three major star systems: Experience (professional journey), Skills (technical abilities), and Projects (creative achievements). Each system contains multiple worlds of discovery.",
          type: "text",
        },
      ],
      actions: [
        {
          label: "Start Career Tour",
          action: "tour:career-journey",
          icon: "🚀",
        },
        {
          label: "Technical Deep Dive",
          action: "tour:technical-deep-dive",
          icon: "⚡",
        },
        { label: "Free Exploration", action: "mode:free", icon: "🌌" },
      ],
    };
  }

  private createExperienceContent(): OverlayContent {
    return {
      title: "Experience Planet",
      subtitle: "Professional Growth Sector",
      description:
        "A world shaped by professional challenges, leadership opportunities, and continuous learning.",
      sections: [
        {
          id: "overview",
          title: "Career Timeline",
          content:
            "Explore the moons of this planet to discover specific roles, companies, and achievements that have shaped the professional journey.",
          type: "text",
        },
        {
          id: "highlights",
          title: "Key Achievements",
          content: "",
          type: "achievements",
          data: [
            {
              icon: "👥",
              title: "Team Leadership",
              description:
                "Led cross-functional teams to deliver complex projects",
              metric: "10+ teams managed",
            },
            {
              icon: "📈",
              title: "Growth Impact",
              description:
                "Drove significant business growth through technical innovation",
              metric: "200% performance increase",
            },
            {
              icon: "🏆",
              title: "Recognition",
              description:
                "Received multiple awards for technical excellence and leadership",
              metric: "5+ awards",
            },
          ],
        },
      ],
      actions: [
        {
          label: "Explore Moons",
          action: "navigate:experience-moons",
          icon: "🌙",
        },
        { label: "View Timeline", action: "content:timeline", icon: "📅" },
      ],
    };
  }

  private createSkillsContent(): OverlayContent {
    return {
      title: "Skills Constellation",
      subtitle: "Technical Mastery Zone",
      description:
        "A constellation of technical abilities, creative tools, and problem-solving methodologies.",
      sections: [
        {
          id: "categories",
          title: "Skill Categories",
          content:
            "Each moon represents a different category of expertise, from programming languages to design tools to leadership methodologies.",
          type: "text",
        },
        {
          id: "mastery",
          title: "Technical Mastery",
          content: "",
          type: "skills",
          data: this.skillsByHeading(),
        },
      ],
      actions: [
        {
          label: "Skill Deep Dive",
          action: "tour:technical-deep-dive",
          icon: "⚡",
        },
        { label: "View Portfolio", action: "navigate:projects", icon: "🎨" },
      ],
    };
  }

  private createMoonContent(moonData: any): OverlayContent {
    return {
      title: moonData?.company || moonData?.name || "Experience Details",
      subtitle:
        moonData?.role || moonData?.category || "Professional Experience",
      description:
        moonData?.description ||
        "Detailed information about this professional experience.",
      sections: [
        {
          id: "details",
          title: "Details",
          content:
            moonData?.responsibilities ||
            moonData?.description ||
            "Comprehensive overview of responsibilities and achievements.",
          type: "text",
        },
        {
          id: "timeline",
          title: "Timeline",
          content: "",
          type: "timeline",
          data: moonData?.timeline || [
            {
              date: moonData?.startDate || "2023",
              title: moonData?.role || "Position",
              description:
                moonData?.description ||
                "Key responsibilities and achievements",
              technologies: moonData?.technologies || [],
            },
          ],
        },
      ],
      actions: [
        { label: "View Portfolio", action: "portfolio:view", icon: "📁" },
        { label: "Contact Info", action: "contact:show", icon: "📧" },
      ],
    };
  }

  private createTechnicalOverviewContent(): OverlayContent {
    return {
      title: "Technical Architecture Overview",
      subtitle: "Code, Creativity, and Innovation",
      description:
        "A deep dive into the technical foundations, architectural decisions, and innovative solutions that power modern web development.",
      sections: [
        {
          id: "architecture",
          title: "System Architecture",
          content: [
            "🏗️ Modern web architecture with React and TypeScript",
            "⚡ Performance-optimized with advanced bundling and caching",
            "🎨 3D graphics powered by Three.js and WebGL",
            "🔧 DevOps practices with CI/CD and automated testing",
            "📱 Responsive design for cross-platform compatibility",
          ],
          type: "text",
        },
      ],
      actions: [
        { label: "Code Examples", action: "code:examples", icon: "💻" },
        { label: "Architecture Diagrams", action: "diagrams:show", icon: "📊" },
      ],
    };
  }

  private createTechnicalSkillsContent(): OverlayContent {
    return {
      title: "Technical Skills Deep Dive",
      subtitle: "Programming Mastery and Innovation",
      description:
        "Advanced technical capabilities spanning multiple programming languages, frameworks, and development methodologies.",
      sections: [
        {
          id: "core-tech",
          title: "Core Technologies",
          content: "",
          type: "skills",
          data: this.skillsByHeading(),
        },
      ],
      actions: [
        { label: "View Code Samples", action: "code:samples", icon: "⚡" },
        { label: "Project Gallery", action: "projects:gallery", icon: "🎨" },
      ],
    };
  }

  private createTechnicalMoonContent(moonData: any): OverlayContent {
    return {
      title: `${moonData?.name || "Technical Skill"} Deep Dive`,
      subtitle: "Advanced Implementation Details",
      description:
        moonData?.description ||
        "Detailed technical exploration of implementation patterns and best practices.",
      sections: [
        {
          id: "implementation",
          title: "Implementation",
          content:
            moonData?.implementation ||
            "Advanced patterns and methodologies for this technology.",
          type: "text",
        },
        {
          id: "examples",
          title: "Code Examples",
          content: "",
          type: "gallery",
          data: moonData?.examples || [],
        },
      ],
      actions: [
        { label: "Live Demo", action: "demo:show", icon: "🚀" },
        { label: "Source Code", action: "github:view", icon: "💻" },
      ],
    };
  }

  private createLeadershipOverviewContent(): OverlayContent {
    return {
      title: "Leadership Journey",
      subtitle: "Strategy, Teams, and Transformation",
      description:
        "The evolution of leadership capabilities, from individual contribution to strategic team leadership and organizational impact.",
      sections: [
        {
          id: "philosophy",
          title: "Leadership Philosophy",
          content: [
            "🎯 Vision-driven leadership with clear, achievable goals",
            "👥 Collaborative team building and individual growth focus",
            "🚀 Innovation encouragement with calculated risk-taking",
            "📈 Data-driven decisions balanced with creative intuition",
            "🌱 Continuous learning and adaptive leadership style",
          ],
          type: "text",
        },
      ],
      actions: [
        { label: "Team Stories", action: "stories:team", icon: "👥" },
        { label: "Project Impact", action: "impact:projects", icon: "📈" },
      ],
    };
  }

  private createLeadershipMoonContent(moonData: any): OverlayContent {
    return {
      title: `Leadership at ${moonData?.company || "Organization"}`,
      subtitle: moonData?.role || "Leadership Role",
      description:
        "Strategic leadership, team development, and organizational impact during this role.",
      sections: [
        {
          id: "leadership-impact",
          title: "Leadership Impact",
          content: "",
          type: "achievements",
          data: [
            {
              icon: "👥",
              title: "Team Development",
              description: "Built and mentored high-performing teams",
              metric: moonData?.teamSize
                ? `${moonData.teamSize} team members`
                : "5-15 team members",
            },
            {
              icon: "📊",
              title: "Project Delivery",
              description: "Led successful delivery of complex projects",
              metric: moonData?.projectCount
                ? `${moonData.projectCount} projects`
                : "Multiple projects",
            },
          ],
        },
      ],
      actions: [
        { label: "Team Testimonials", action: "testimonials:show", icon: "💬" },
        { label: "Project Case Study", action: "case-study:show", icon: "📋" },
      ],
    };
  }
}
